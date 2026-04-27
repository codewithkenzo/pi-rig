import type { ThemeEngine } from "../../../../shared/theme/engine.js";
import type { Palette, ThemeConfig } from "../../../../shared/theme/types.js";
import { spin, breathe, withMotion, type AnimationState } from "../../../../shared/theme/animation.js";
import type { FlowJob } from "../types.js";
import type { FlowActivityRow } from "./journal.js";
import { selectActivityDisplayRows, type FlowActivityDisplayRow, type FlowQueueRailRow } from "./selectors.js";
import { STATUS_ICONS } from "./icons.js";
import { fitAnsiColumn, truncateToWidth, visibleWidth } from "./layout.js";
import { renderDetailPaneContent } from "./summary.js";

const DEFAULT_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

const clamp = (value: number, min: number, max: number): number =>
	Math.max(min, Math.min(max, value));

const fmtDuration = (ms: number): string => {
	if (ms < 1000) return `${ms}ms`;
	const s = Math.round(ms / 1000);
	if (s < 60) return `${s}s`;
	const mn = Math.floor(s / 60);
	const rem = s % 60;
	return rem === 0 ? `${mn}m` : `${mn}m${String(rem).padStart(2, "0")}s`;
};

const rowTone = (tone: FlowActivityDisplayRow["tone"]): "text" | "dim" | "success" | "warning" | "error" | "accent" => {
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

const buildActivityLine = (engine: ThemeEngine, row: FlowActivityDisplayRow, width: number): string => {
	const tone = rowTone(row.tone);
	const timestamp = engine.fg("dim", truncateToWidth(row.timestamp.padStart(5), 5));
	const marker = engine.fg(tone, truncateToWidth(row.marker, 1));
	const chipWidth = 13;
	const chip = engine.fg(tone, truncateToWidth(row.chip.toUpperCase(), chipWidth));
	const fixedWidth = 5 + 2 + 1 + 1 + chipWidth + 1;
	const remaining = Math.max(0, width - fixedWidth);
	const labelWidth = remaining >= 18 ? Math.min(14, Math.max(7, Math.floor(remaining * 0.34))) : 0;
	const detailWidth = Math.max(0, remaining - labelWidth);
	const label = labelWidth > 0 ? engine.fg("label", truncateToWidth(row.label, labelWidth)) : "";
	const detail = engine.fg("text", truncateToWidth(row.detail, detailWidth));
	return fitAnsiColumn(`${timestamp}  ${marker} ${chip} ${label}${detail}`, width);
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

const buildRailHeader = (engine: ThemeEngine, width: number, rowsLength: number, compact: boolean): string => {
	const label = engine.fg("header", "  FLOW JOBS / AGENTS");
	const count = engine.fg("muted", `[${String(rowsLength).padStart(2, "0")}]`);
	const gap = Math.max(1, width - visibleWidth(label) - visibleWidth(count));
	return fitAnsiColumn(`${label}${" ".repeat(gap)}${count}`, width);
};

const buildRailColumnsHeader = (engine: ThemeEngine, width: number, compact: boolean, hasPhase: boolean): string => {
	const text = compact
		? "  ID  JOB / AGENT  STATUS  AGE  BUDGET"
		: hasPhase
			? "  ID  AGENT / JOB  STATUS  PROF  FRESH  BUDGET  PHASE"
			: "  ID  AGENT / JOB  STATUS  PROF  FRESH  BUDGET";
	return engine.fg("muted", truncateToWidth(text, width));
};

const selectVisibleRailRows = (rows: readonly FlowQueueRailRow[], maxRows: number): FlowQueueRailRow[] => {
	if (maxRows <= 0 || rows.length <= maxRows) {
		return rows.slice(0, maxRows);
	}
	const selectedIndex = rows.findIndex((row) => row.selected);
	const anchor = selectedIndex >= 0 ? selectedIndex : 0;
	const start = clamp(anchor - Math.floor(maxRows / 2), 0, rows.length - maxRows);
	return rows.slice(start, start + maxRows);
};

const buildRailRow = (engine: ThemeEngine, row: FlowQueueRailRow, width: number, compact: boolean): string => {
	const marker = row.selected ? engine.fg("accent", "▎") : engine.fg("border", " ");
	const ordinal = row.selected ? engine.bold(engine.fg("accent", row.ordinal)) : engine.fg("muted", row.ordinal);
	const idHint = engine.fg("dim", row.idHint);
	const title = row.selected ? engine.bold(engine.fg("text", row.title)) : engine.fg("text", row.title);
	const subtitle = engine.fg("muted", row.subtitle);
	const proof = engine.fg("label", row.proofToken);
	const leftPlain = [engine.strip(ordinal), engine.strip(idHint), engine.strip(title), engine.strip(subtitle), engine.strip(proof)]
		.filter((piece) => piece.length > 0)
		.join(" · ");

	const status = engine.fg(row.statusTone, row.statusToken.toUpperCase());
	const freshness = engine.fg("dim", row.freshnessLabel);
	const budget = row.budgetLabel !== undefined ? engine.fg("value", row.budgetLabel) : undefined;
	const phase = row.phaseToken !== undefined ? engine.fg("accent", row.phaseToken) : undefined;
	const rightParts = compact
		? [status, freshness, budget]
		: [status, freshness, budget, phase];
	const rightPlain = rightParts.filter((piece): piece is string => piece !== undefined).join("  ");
	const rightWidth = visibleWidth(rightPlain);
	const prefix = `${marker} `;
	const leftBudget = Math.max(0, width - visibleWidth(prefix) - rightWidth - 1);
	const left = truncateToWidth(leftPlain, leftBudget);
	const leftStyled = row.selected ? engine.bold(engine.fg("text", left)) : engine.fg("text", left);
	const gap = Math.max(1, width - visibleWidth(prefix) - visibleWidth(leftStyled) - rightWidth);
	return fitAnsiColumn(`${prefix}${leftStyled}${" ".repeat(gap)}${rightPlain}`, width);
};

const buildRailViewport = (
	engine: ThemeEngine,
	rows: readonly FlowQueueRailRow[],
	width: number,
	compact: boolean,
	linesBudget: number,
): string[] => {
	if (linesBudget <= 0) {
		return [];
	}
	const hasPhase = rows.some((row) => row.phaseToken !== undefined);
	const headerLines = linesBudget >= 2 ? 2 : 1;
	const visibleRowBudget = Math.max(0, linesBudget - headerLines);
	const visibleRows = selectVisibleRailRows(rows, visibleRowBudget);
	const lines: string[] = [buildRailHeader(engine, width, rows.length, compact)];
	if (headerLines >= 2) {
		lines.push(buildRailColumnsHeader(engine, width, compact, hasPhase));
	}
	for (const row of visibleRows) {
		lines.push(buildRailRow(engine, row, width, compact));
	}
	while (lines.length < linesBudget) {
		lines.push(" ".repeat(width));
	}
	return lines.slice(0, linesBudget).map((line) => fitAnsiColumn(line, width));
};

const buildFeedViewport = (
	engine: ThemeEngine,
	rows: readonly FlowActivityRow[],
	job: FlowJob | undefined,
	width: number,
	feedLines: number,
): string[] => {
	if (feedLines <= 0) {
		return [];
	}
	const visible = selectActivityDisplayRows(rows, job).slice(-feedLines);
	const rendered = visible.map((entry) => buildActivityLine(engine, entry, width));
	if (rendered.length === 0) {
		rendered.push(engine.fg("muted", truncateToWidth("  (waiting…)", width)));
	}
	while (rendered.length < feedLines) {
		rendered.push(" ".repeat(width));
	}
	return rendered.slice(0, feedLines).map((line) => fitAnsiColumn(line, width));
};

const computeWidePaneWidths = (width: number): { left: number; center: number; right: number } => {
	const separatorWidth = 2;
	const contentWidth = Math.max(0, width - separatorWidth);
	const left = Math.min(contentWidth, Math.max(0, Math.round(width * 0.29)));
	const right = Math.min(contentWidth - left, Math.max(0, Math.round(width * 0.31)));
	const center = Math.max(0, contentWidth - left - right);
	return { left, center, right };
};

const buildPaneHeader = (engine: ThemeEngine, title: string, meta: string, width: number): string => {
	const left = engine.fg("header", truncateToWidth(`  ${title}`, Math.min(width, Math.max(0, width - visibleWidth(meta) - 1))));
	const gap = Math.max(1, width - visibleWidth(left) - visibleWidth(meta));
	return fitAnsiColumn(`${left}${" ".repeat(gap)}${engine.fg("muted", meta)}`, width);
};

const buildActivityPane = (
	engine: ThemeEngine,
	job: FlowJob | undefined,
	rows: readonly FlowActivityRow[],
	width: number,
	height: number,
): string[] => {
	if (height <= 0) {
		return [];
	}
	const label = job?.profile ?? job?.agent ?? "selected";
	const header = buildPaneHeader(engine, "LIVE ACTIVITY", truncateToWidth(label, Math.max(8, Math.floor(width * 0.32))).trimEnd(), width);
	const feed = buildFeedViewport(engine, rows, job, width, Math.max(0, height - 1));
	return [header, ...feed].slice(0, height).map((line) => fitAnsiColumn(line, width));
};

const zipThreePanes = (
	left: readonly string[],
	center: readonly string[],
	right: readonly string[],
	leftWidth: number,
	centerWidth: number,
	rightWidth: number,
	separator: string,
	rows: number,
): string[] => {
	const result: string[] = [];
	for (let index = 0; index < rows; index++) {
		result.push(`${fitAnsiColumn(left[index] ?? "", leftWidth)}${separator}${fitAnsiColumn(center[index] ?? "", centerWidth)}${separator}${fitAnsiColumn(right[index] ?? "", rightWidth)}`);
	}
	return result;
};

export const renderWideBody = (
	engine: ThemeEngine,
	palette: Palette,
	config: ThemeConfig,
	railRows: readonly FlowQueueRailRow[],
	job: FlowJob | undefined,
	activityRows: readonly FlowActivityRow[],
	summaryScroll: number,
	animState: AnimationState,
	width: number,
	sectionHeight: number,
): string[] => {
	if (sectionHeight <= 2) {
		const divider = engine.fg("border", "─".repeat(width));
		return [divider, divider].slice(0, Math.max(1, sectionHeight)).map((line) => fitAnsiColumn(line, width));
	}

	const separator = engine.fg("border", "│");
	const { left, center, right } = computeWidePaneWidths(width);
	const divider = engine.fg("border", "─".repeat(width));
	const innerHeight = Math.max(1, sectionHeight - 2);
	const leftPane = buildRailViewport(engine, railRows, left, false, innerHeight);
	const centerPane = buildActivityPane(engine, job, activityRows, center, innerHeight);
	const rightPane = renderDetailPaneContent(
		engine,
		palette,
		config,
		job,
		summaryScroll,
		right,
		innerHeight,
		animState,
		activityRows,
	);

	return [
		divider,
		...zipThreePanes(leftPane, centerPane, rightPane, left, center, right, separator, innerHeight),
		divider,
	].map((line) => fitAnsiColumn(line, width));
};

export const renderColumns = (
	engine: ThemeEngine,
	palette: Palette,
	config: ThemeConfig,
	railRows: readonly FlowQueueRailRow[],
	job: FlowJob | undefined,
	activityRows: readonly FlowActivityRow[],
	animState: AnimationState,
	width: number,
	compact: boolean,
	sectionHeight: number,
): string[] => {
	const reducedMotion = !config.animation.enabled || config.animation.reducedMotion;
	const divider = engine.fg("border", "─".repeat(width));
	if (sectionHeight <= 2) {
		return [divider, divider].slice(0, Math.max(1, sectionHeight)).map((line) => fitAnsiColumn(line, width));
	}

	const innerHeight = Math.max(1, sectionHeight - 2);
	const maxFeedLines = compact ? 4 : 6;
	const feedLines = Math.max(1, Math.min(maxFeedLines, Math.max(1, Math.floor((innerHeight - 2) / 3))));
	const topBudget = Math.max(0, innerHeight - feedLines - 2);
	const railLines = buildRailViewport(engine, railRows, width, compact, topBudget);

	const activityHeader = engine.fg("header", truncateToWidth("  LIVE ACTIVITY", width));
	const feedViewport = buildFeedViewport(engine, activityRows, job, width, feedLines);
	const trailer = activityRows.length > 0
		? withMotion(
			() => breathe("  auto-refresh", palette.semantic.muted, animState),
			engine.fg("dim", "  auto-refresh"),
			reducedMotion,
		)
		: " ".repeat(width);

	return [divider, ...railLines, activityHeader, ...feedViewport, truncateToWidth(trailer, width), divider]
		.map((line) => fitAnsiColumn(line, width));
};
