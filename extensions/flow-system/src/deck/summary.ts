import type { ThemeEngine } from "../../../../shared/theme/engine.js";
import type { Palette, ThemeConfig } from "../../../../shared/theme/types.js";
import { breathe, withMotion, type AnimationState } from "../../../../shared/theme/animation.js";
import type { FlowJob } from "../types.js";
import type { FlowActivityRow } from "./journal.js";
import { fitAnsiColumn, truncateToWidth } from "./layout.js";
import { sanitizeFlowText } from "../sanitize.js";
import { selectCoordinatorDetail } from "./selectors.js";

export const sanitize = sanitizeFlowText;

const wrapLines = (content: string, innerWidth: number): string[] =>
	content.split("\n").flatMap((line) => {
		if (line.length === 0) return [""];
		const chunks: string[] = [];
		let rem = line;
		while (rem.length > innerWidth) {
			chunks.push(rem.slice(0, innerWidth));
			rem = rem.slice(innerWidth);
		}
		chunks.push(rem);
		return chunks;
	});

const renderDetailRow = (label: string, value: string, innerWidth: number): string[] => {
	const labelWidth = Math.min(14, Math.max(8, Math.floor(innerWidth * 0.28)));
	const safeLabel = sanitizeFlowText(label).replace(/\s+/g, " ");
	const prefix = `  ${safeLabel.padEnd(labelWidth).slice(0, labelWidth)} `;
	const continuation = `  ${" ".repeat(labelWidth)} `;
	const valueWidth = Math.max(12, innerWidth - labelWidth - 3);
	const wrapped = wrapLines(sanitizeFlowText(value), valueWidth);
	return wrapped.map((line, index) => `${index === 0 ? prefix : continuation}${line}`);
};

const detailLines = (job: FlowJob, activityRows: readonly FlowActivityRow[], innerWidth: number): string[] => {
	const detail = selectCoordinatorDetail(job, activityRows);
	const lines: string[] = [];
	for (const section of detail.sections) {
		if (lines.length > 0) {
			lines.push("");
		}
		lines.push(`  ${section.title}`);
		for (const row of section.rows) {
			lines.push(...renderDetailRow(row.label, row.value, innerWidth));
		}
	}
	return lines;
};

export const renderDetailPaneContent = (
	engine: ThemeEngine,
	palette: Palette,
	config: ThemeConfig,
	job: FlowJob | undefined,
	scrollOffset: number,
	width: number,
	contentHeight: number,
	animState: AnimationState,
	activityRows: readonly FlowActivityRow[] = [],
): string[] => {
	if (contentHeight <= 0) {
		return [];
	}

	const reducedMotion = !config.animation.enabled || config.animation.reducedMotion;
	const contentLines = Math.max(1, contentHeight - 2);
	const innerWidth = Math.max(20, width - 4);

	if (job === undefined) {
		const emptyBody = [
			engine.fg("label", "  DETAIL / SELECTED FLOW"),
			engine.fg("muted", "  No flow jobs yet."),
			...Array.from({ length: contentLines }, () => " ".repeat(width)),
		].slice(0, contentHeight);
		while (emptyBody.length < contentHeight) {
			emptyBody.push(" ".repeat(width));
		}
		return emptyBody.map((line) => fitAnsiColumn(line, width));
	}

	const detail = selectCoordinatorDetail(job, activityRows);
	const allLines = detailLines(job, activityRows, innerWidth);
	const totalLines = allLines.length;
	const maxScroll = Math.max(0, totalLines - contentLines);
	const clamped = Math.min(scrollOffset, maxScroll);
	const visible = allLines.slice(clamped, clamped + contentLines);
	while (visible.length < contentLines) {
		visible.push(" ".repeat(innerWidth));
	}

	const hintLine = totalLines > contentLines
		? withMotion(
			() => breathe(`  PgUp/PgDn · line ${clamped + 1}/${totalLines}`, palette.semantic.dim, animState),
			engine.fg("dim", `  PgUp/PgDn · line ${clamped + 1}/${totalLines}`),
			reducedMotion,
		)
		: " ".repeat(width);

	return [
		engine.fg("label", `  ${detail.title}`),
		...visible.map((line) => engine.fg("text", truncateToWidth(line, width))),
		truncateToWidth(hintLine, width),
	].slice(0, contentHeight).map((line) => fitAnsiColumn(line, width));
};

export const renderSummary = (
	engine: ThemeEngine,
	palette: Palette,
	config: ThemeConfig,
	job: FlowJob | undefined,
	scrollOffset: number,
	width: number,
	sectionHeight: number,
	animState: AnimationState,
	activityRows: readonly FlowActivityRow[] = [],
): string[] => {
	const divider = engine.fg("border", "─".repeat(width));

	if (sectionHeight <= 2) {
		return [divider, divider].slice(0, Math.max(1, sectionHeight)).map((line) => fitAnsiColumn(line, width));
	}

	const innerHeight = Math.max(1, sectionHeight - 2);
	const content = renderDetailPaneContent(
		engine,
		palette,
		config,
		job,
		scrollOffset,
		width,
		innerHeight,
		animState,
		activityRows,
	);

	return [
		divider,
		...content,
		divider,
	].map((line) => fitAnsiColumn(line, width));
};
