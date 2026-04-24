import type { ThemeEngine } from "../../../../shared/theme/engine.js";
import type { Palette, ThemeConfig } from "../../../../shared/theme/types.js";
import { breathe, spin, withMotion, type AnimationState } from "../../../../shared/theme/animation.js";
import { ellipsize } from "../../../../shared/ui/hud.js";
import type { FlowJob } from "../types.js";
import type { FeedState } from "./state.js";
import { STATUS_ICONS } from "./icons.js";
import { fitAnsiColumn, truncateToWidth } from "./layout.js";

const DEFAULT_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

const normalizeValue = (value: string | undefined): string | undefined => {
	if (value === undefined) {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

const fmtTime = (ts: number): string => {
	const d = new Date(ts);
	return [d.getHours(), d.getMinutes(), d.getSeconds()]
		.map((n) => String(n).padStart(2, "0"))
		.join(":");
};

const fmtDuration = (ms: number): string => {
	if (ms < 1000) return `${ms}ms`;
	const s = Math.round(ms / 100) / 10;
	if (s < 60) return `${s}s`;
	const mn = Math.floor(s / 60);
	return `${mn}m${Math.round(s % 60)}s`;
};

const relTs = (ts: number, startedAt: number | undefined): string => {
	if (startedAt === undefined) return "+?s";
	const diff = Math.max(0, Math.round((ts - startedAt) / 1000));
	return `+${diff}s`;
};

const statusTone = (status: FlowJob["status"]): "active" | "warning" | "success" | "error" | "inactive" => {
	switch (status) {
		case "running":
			return "active";
		case "pending":
			return "warning";
		case "done":
			return "success";
		case "failed":
			return "error";
		case "cancelled":
			return "inactive";
	}
};

const spinnerIcon = (
	job: FlowJob,
	palette: Palette,
	config: ThemeConfig,
	animState: AnimationState,
	reducedMotion: boolean,
): string => {
	if (job.status !== "running") return STATUS_ICONS[job.status];
	const frames = palette.animations?.runningFrames ?? DEFAULT_FRAMES;
	const fps = Math.min(8, Math.max(4, config.animation.fps));
	return withMotion(
		() => spin(frames, animState, fps),
		STATUS_ICONS.running,
		reducedMotion,
	);
};

const modelText = (job: FlowJob): string => {
	const envelopeModel = normalizeValue(job.envelope?.model);
	const envelopeProvider = normalizeValue(job.envelope?.provider);
	if (envelopeModel !== undefined) {
		return envelopeProvider !== undefined ? `${envelopeModel}@${envelopeProvider}` : envelopeModel;
	}
	const legacyModel = normalizeValue(job.model);
	return legacyModel ?? "(default)";
};

const reasoningText = (job: FlowJob): string => job.envelope?.reasoning ?? "(profile default)";
const effortText = (job: FlowJob): string => job.envelope?.effort ?? "auto";

const renderRow = (
	engine: ThemeEngine,
	label: string,
	value: string,
	width: number,
	one: "text" | "accent" | "muted" = "text",
): string =>
	engine.fg(one, truncateToWidth(`  ${label.padEnd(10)} ${value}`, width));

const buildTopCandidates = (
	engine: ThemeEngine,
	palette: Palette,
	config: ThemeConfig,
	job: FlowJob | undefined,
	animState: AnimationState,
	reducedMotion: boolean,
	width: number,
): string[] => {
	if (job === undefined) {
		return [
			engine.fg("header", truncateToWidth("  WORK ITEM", width)),
			engine.fg("muted", truncateToWidth("  No selection", width)),
		];
	}

	const icon = spinnerIcon(job, palette, config, animState, reducedMotion);
	const status = engine.fg(statusTone(job.status), `${icon} ${job.status}`);
	const model = `${modelText(job)} · r:${reasoningText(job)} · e:${effortText(job)}`;
	const timeParts = [job.startedAt !== undefined ? `start ${fmtTime(job.startedAt)}` : undefined];
	if (job.finishedAt !== undefined && job.startedAt !== undefined) {
		timeParts.push(`dur ${fmtDuration(job.finishedAt - job.startedAt)}`);
	} else if (job.startedAt !== undefined && (job.status === "running" || job.status === "pending")) {
		timeParts.push(`run ${fmtDuration(Date.now() - job.startedAt)}`);
	}
	const stateParts = [job.toolCount !== undefined ? `tools ${job.toolCount}` : undefined];
	if (job.status === "running" && job.writingSummary === true) {
		stateParts.push(`writing-summary${job.summaryPhaseSource !== undefined ? `:${job.summaryPhaseSource}` : ""}`);
	}
	const tools = Array.isArray(job.recentTools) && job.recentTools.length > 0
		? job.recentTools.slice(-4).join(" · ")
		: "—";

	return [
		engine.fg("header", truncateToWidth("  WORK ITEM", width)),
		engine.fg(
			"text",
			truncateToWidth(`  TASK       ${ellipsize(job.task, Math.max(20, width - 13))}`, width),
		),
		truncateToWidth(`  AGENT      ${engine.strip(status)} ${job.profile}`, width),
		renderRow(engine, "MODEL", model, width),
		renderRow(engine, "TIME", timeParts.filter(Boolean).join(" · ") || "—", width),
		renderRow(engine, "STATE", stateParts.filter(Boolean).join(" · ") || "—", width),
		renderRow(engine, "TOOLS", tools, width, tools === "—" ? "muted" : "accent"),
	];
};

const buildFeedViewport = (
	engine: ThemeEngine,
	feed: FeedState,
	job: FlowJob | undefined,
	width: number,
	feedLines: number,
): string[] => {
	if (feedLines <= 0) {
		return [];
	}
	const visible = feed.lines.slice(-feedLines);
	const rendered = visible.map((entry) => {
		const ts = engine.fg("dim", relTs(entry.ts, job?.startedAt).padStart(5));
		const text = engine.fg("text", truncateToWidth(entry.text, Math.max(10, width - 9)));
		return `${ts}  ${text}`;
	});
	if (rendered.length === 0) {
		rendered.push(engine.fg("muted", truncateToWidth("  (waiting…)", width)));
	}
	while (rendered.length < feedLines) {
		rendered.push(" ".repeat(width));
	}
	return rendered.slice(0, feedLines).map((line) => fitAnsiColumn(line, width));
};

export const renderColumns = (
	engine: ThemeEngine,
	palette: Palette,
	config: ThemeConfig,
	job: FlowJob | undefined,
	feed: FeedState,
	animState: AnimationState,
	width: number,
	compact: boolean,
	sectionHeight: number,
): string[] => {
	const reducedMotion = !config.animation.enabled || config.animation.reducedMotion;
	const divider = engine.fg("border", "─".repeat(width));
	if (sectionHeight <= 2) {
		return [divider, divider].slice(0, Math.max(1, sectionHeight));
	}

	const innerHeight = Math.max(1, sectionHeight - 2);
	const maxFeedLines = compact ? 4 : 6;
	const feedLines = Math.max(1, Math.min(maxFeedLines, Math.max(1, Math.floor((innerHeight - 2) / 3))));
	const topBudget = Math.max(0, innerHeight - feedLines - 2);
	const topCandidates = buildTopCandidates(engine, palette, config, job, animState, reducedMotion, width);
	const topLines = topCandidates.slice(0, topBudget);
	while (topLines.length < topBudget) {
		topLines.push(" ".repeat(width));
	}

	const activityHeader = engine.fg("header", truncateToWidth("  LIVE ACTIVITY", width));
	const feedViewport = buildFeedViewport(engine, feed, job, width, feedLines);
	const trailer = feed.lines.length > 0
		? withMotion(
			() => breathe("  auto-refresh", palette.semantic.muted, animState),
			engine.fg("dim", "  auto-refresh"),
			reducedMotion,
		)
		: " ".repeat(width);

	return [divider, ...topLines, activityHeader, ...feedViewport, truncateToWidth(trailer, width), divider]
		.map((line) => fitAnsiColumn(line, width));
};
