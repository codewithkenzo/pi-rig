import type { ThemeEngine } from "../../../../shared/theme/engine.js";
import type { Palette, ThemeConfig } from "../../../../shared/theme/types.js";
import { spin, breathe, withMotion, type AnimationState } from "../../../../shared/theme/animation.js";
import { ellipsize } from "../../../../shared/ui/hud.js";
import type { FlowJob } from "../types.js";
import type { FlowActivityRow } from "./journal.js";
import { STATUS_ICONS } from "./icons.js";
import { truncateToWidth } from "./layout.js";

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

const rowTone = (tone: FlowActivityRow["tone"]): "text" | "dim" | "success" | "warning" | "error" | "accent" => {
	switch (tone) {
		case "muted":
			return "dim";
		case "success":
			return "success";
		case "warning":
			return "warning";
		case "error":
			return "error";
		case "active":
			return "accent";
		default:
			return "text";
	}
};

const rowText = (row: FlowActivityRow): string =>
	row.label !== undefined ? `${row.label} ${row.text}` : row.text;

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

const metaRows = (job: FlowJob): Array<[string, string, "value" | "dim" | "success"]> => {
	const rows: Array<[string, string, "value" | "dim" | "success"]> = [];
	rows.push(["Model", modelText(job), "value"]);
	rows.push(["Reasoning", reasoningText(job), "value"]);
	rows.push(["Effort", effortText(job), "value"]);

	if (job.toolCount !== undefined) {
		rows.push(["Tool calls", `${job.toolCount}`, "value"]);
	}
	if (job.status === "running" && job.writingSummary === true) {
		rows.push([
			"Phase",
			`writing-summary${job.summaryPhaseSource !== undefined ? `:${job.summaryPhaseSource}` : ""}`,
			"success",
		]);
	}
	if (job.startedAt !== undefined) {
		rows.push(["Started", fmtTime(job.startedAt), "dim"]);
	}
	if (job.finishedAt !== undefined && job.startedAt !== undefined) {
		rows.push(["Duration", fmtDuration(job.finishedAt - job.startedAt), "dim"]);
	} else if (job.startedAt !== undefined && (job.status === "running" || job.status === "pending")) {
		rows.push(["Running", fmtDuration(Date.now() - job.startedAt), "dim"]);
	}
	return rows;
};

const toneText = (
	engine: ThemeEngine,
	tone: "value" | "dim" | "success",
	value: string,
): string => {
	if (tone === "dim") {
		return engine.fg("dim", value);
	}
	if (tone === "success") {
		return engine.fg("success", value);
	}
	return engine.fg("value", value);
};

const renderHierarchy = (
	engine: ThemeEngine,
	palette: Palette,
	config: ThemeConfig,
	job: FlowJob | undefined,
	activityRows: readonly FlowActivityRow[],
	animState: AnimationState,
	width: number,
	compact: boolean,
	reducedMotion: boolean,
): string[] => {
	if (job === undefined) {
		return [engine.fg("muted", truncateToWidth("  No selection", width))];
	}

	const lines: string[] = [];
	const isStale = job.error?.includes("stale restore") === true;
	const valueTone: "value" | "inactive" = isStale ? "inactive" : "value";
	const icon = spinnerIcon(job, palette, config, animState, reducedMotion);
	const tone = statusTone(job.status);
	const status = engine.fg(tone, `${icon} ${job.status}`);

	lines.push(engine.fg("header", truncateToWidth("  WORK ITEM", width)));
	lines.push(
		engine.fg(
			"text",
			truncateToWidth(`  TASK       ${ellipsize(job.task, Math.max(20, width - 13))}`, width),
		),
	);
	lines.push(
		truncateToWidth(
			`  AGENT      ${engine.strip(status)} ${job.profile}`,
			width,
		),
	);

	const rows = metaRows(job);
	for (const [label, value, metaTone] of rows) {
		const labelCell = truncateToWidth(label, 10);
		const valueCell = toneText(engine, metaTone, value);
		const content = `    ${labelCell} ${engine.strip(engine.fg(valueTone, engine.strip(valueCell)))}`;
		lines.push(truncateToWidth(content, width));
	}

	if (Array.isArray(job.recentTools) && job.recentTools.length > 0) {
		const tools = job.recentTools.slice(-4).join(" · ");
		lines.push(engine.fg("accent", truncateToWidth(`  TOOLS      ${tools}`, width)));
	}

	lines.push(engine.fg("header", truncateToWidth("  LIVE ACTIVITY", width)));
	const visible = activityRows.slice(-(compact ? 5 : 8));
	for (const entry of visible) {
		const ts = engine.fg("dim", relTs(entry.ts, job.startedAt).padStart(5));
		const text = engine.fg(rowTone(entry.tone), truncateToWidth(rowText(entry), Math.max(10, width - 9)));
		lines.push(`${ts}  ${text}`);
	}
	if (visible.length === 0) {
		lines.push(engine.fg("muted", truncateToWidth("  (waiting…)", width)));
	}
	if (activityRows.length > 0) {
		const trailer = withMotion(
			() => breathe("  auto-refresh", palette.semantic.muted, animState),
			engine.fg("dim", "  auto-refresh"),
			reducedMotion,
		);
		lines.push(truncateToWidth(trailer, width));
	}

	return lines;
};

export const renderColumns = (
	engine: ThemeEngine,
	palette: Palette,
	config: ThemeConfig,
	job: FlowJob | undefined,
	activityRows: readonly FlowActivityRow[],
	animState: AnimationState,
	width: number,
	compact: boolean,
): string[] => {
	const reducedMotion = !config.animation.enabled || config.animation.reducedMotion;
	const divider = engine.fg("border", "─".repeat(width));
	const contentWidth = compact ? width - 2 : width;
	const lines = renderHierarchy(engine, palette, config, job, activityRows, animState, contentWidth, compact, reducedMotion);
	return [divider, ...lines, divider];
};
