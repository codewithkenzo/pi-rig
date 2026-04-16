import type { ThemeEngine } from "../../../../shared/theme/engine.js";
import type { Palette, ThemeConfig } from "../../../../shared/theme/types.js";
import { spin, breathe, withMotion, type AnimationState } from "../../../../shared/theme/animation.js";
import { ellipsize } from "../../../../shared/ui/hud.js";
import type { FlowJob } from "../types.js";
import type { FeedState } from "./state.js";
import { STATUS_ICONS } from "./icons.js";
import { zipColumns, truncateToWidth } from "./layout.js";

const DEFAULT_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const FEED_DISPLAY_MAX = 7;

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

const profileRows = (engine: ThemeEngine, job: FlowJob): Array<[string, string]> => {
	const rows: Array<[string, string]> = [];
	const isStale = job.error?.includes("stale restore") === true;
	const v = (text: string): string =>
		isStale ? engine.fg("inactive", text) : engine.fg("value", text);

	rows.push([engine.fg("label", "Profile"), v(job.profile)]);

	const statusColored =
		job.status === "running"  ? engine.fg("active", job.status) :
		job.status === "pending"  ? engine.fg("warning", job.status) :
		job.status === "done"     ? engine.fg("success", job.status) :
		job.status === "failed"   ? engine.fg("error", job.status) :
		                            engine.fg("inactive", job.status);
	rows.push([engine.fg("label", "Status"), isStale ? engine.fg("inactive", job.status) : statusColored]);

	if (job.toolCount !== undefined) {
		rows.push([engine.fg("label", "Tools"), v(`${job.toolCount} calls`)]);
	}
	if (job.status === "running" && job.writingSummary === true) {
		rows.push([
			engine.fg("label", "Phase"),
			engine.fg("success", `writing-summary${job.summaryPhaseSource !== undefined ? `:${job.summaryPhaseSource}` : ""}`),
		]);
	}
	if (job.startedAt !== undefined) {
		rows.push([engine.fg("label", "Started"), v(fmtTime(job.startedAt))]);
	}
	if (job.finishedAt !== undefined && job.startedAt !== undefined) {
		rows.push([engine.fg("label", "Duration"), v(fmtDuration(job.finishedAt - job.startedAt))]);
	} else if (job.startedAt !== undefined && (job.status === "running" || job.status === "pending")) {
		rows.push([engine.fg("label", "Running"), engine.fg("dim", fmtDuration(Date.now() - job.startedAt))]);
	}

	rows.push([engine.fg("label", "Task"), engine.fg("dim", ellipsize(job.task, 40))]);

	return rows;
};

const renderProfile = (
	engine: ThemeEngine,
	palette: Palette,
	config: ThemeConfig,
	job: FlowJob | undefined,
	animState: AnimationState,
	panelWidth: number,
	reducedMotion: boolean,
): string[] => {
	if (job === undefined) {
		return [truncateToWidth("  No selection", panelWidth)];
	}

	const header = engine.fg("header", truncateToWidth("  SESSION PROFILE", panelWidth));
	const icon = spinnerIcon(job, palette, config, animState, reducedMotion);
	const coloredIcon =
		job.status === "running"  ? engine.fg("active", icon) :
		job.status === "done"     ? engine.fg("success", icon) :
		job.status === "failed"   ? engine.fg("error", icon) :
		                            engine.fg("inactive", icon);

	const LABEL_W = 9;
	const rows = profileRows(engine, job);
	const lines = rows.map(([label, value]) => {
		const l = truncateToWidth(engine.strip(label), LABEL_W);
		return truncateToWidth(`${coloredIcon} ${l} ${engine.strip(value)}`, panelWidth);
	});

	return [header, ...lines];
};

const relTs = (ts: number, startedAt: number | undefined): string => {
	if (startedAt === undefined) return "+?s";
	const diff = Math.max(0, Math.round((ts - startedAt) / 1000));
	return `+${diff}s`;
};

const renderFeed = (
	engine: ThemeEngine,
	palette: Palette,
	feed: FeedState,
	job: FlowJob | undefined,
	animState: AnimationState,
	panelWidth: number,
	reducedMotion: boolean,
): string[] => {
	const header = engine.fg("header", truncateToWidth("  LIVE ACTIVITY", panelWidth));
	const lines: string[] = [header];

	const visible = feed.lines.slice(-FEED_DISPLAY_MAX);
	for (const entry of visible) {
		const ts = relTs(entry.ts, job?.startedAt).padStart(5);
		const text = truncateToWidth(entry.text, panelWidth - 7);
		lines.push(`${engine.fg("dim", ts)}  ${engine.fg("text", text)}`);
	}

	if (feed.lines.length === 0) {
		lines.push(engine.fg("muted", truncateToWidth("  (waiting…)", panelWidth)));
	}

	if (feed.lines.length > 0) {
		const trailer = withMotion(
			() => breathe("  auto-refresh", palette.semantic.muted, animState),
			engine.fg("dim", "  auto-refresh"),
			reducedMotion,
		);
		lines.push(truncateToWidth(trailer, panelWidth));
	}

	return lines;
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
): string[] => {
	const reducedMotion = !config.animation.enabled || config.animation.reducedMotion;
	const divider = engine.fg("border", "─".repeat(width));

	if (compact) {
		// Single-column: profile rows above, feed below
		const profileLines = renderProfile(engine, palette, config, job, animState, width - 2, reducedMotion);
		const feedLines = renderFeed(engine, palette, feed, job, animState, width - 2, reducedMotion);
		return [divider, ...profileLines, ...feedLines, divider];
	}

	// Wide mode: 40/60 split
	const leftWidth = Math.floor(width * 0.40);
	const sep = engine.fg("separator", " │ ");

	const leftLines = renderProfile(engine, palette, config, job, animState, leftWidth - 2, reducedMotion);
	const rightLines = renderFeed(engine, palette, feed, job, animState, width - leftWidth - 5, reducedMotion);

	return [divider, ...zipColumns(leftLines, rightLines, leftWidth, width, sep), divider];
};
