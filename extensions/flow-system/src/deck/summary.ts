import { basename } from "node:path";
import type { ThemeEngine } from "../../../../shared/theme/engine.js";
import type { Palette, ThemeConfig } from "../../../../shared/theme/types.js";
import { breathe, withMotion, type AnimationState } from "../../../../shared/theme/animation.js";
import type { FlowJob } from "../types.js";
import { truncateToWidth } from "./layout.js";
import { sanitizeFlowText } from "../sanitize.js";

export const sanitize = sanitizeFlowText;

const pickContent = (job: FlowJob): string =>
	sanitizeFlowText(job.output ?? job.error ?? job.lastAssistantText ?? job.task);

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

export const renderSummary = (
	engine: ThemeEngine,
	palette: Palette,
	config: ThemeConfig,
	job: FlowJob | undefined,
	scrollOffset: number,
	width: number,
	sectionHeight: number,
	animState: AnimationState,
): string[] => {
	const reducedMotion = !config.animation.enabled || config.animation.reducedMotion;
	const divider = engine.fg("border", "─".repeat(width));
	if (sectionHeight <= 2) {
		return [divider, divider].slice(0, Math.max(1, sectionHeight));
	}

	const innerHeight = Math.max(1, sectionHeight - 2);
	const contentLines = Math.max(1, innerHeight - 3);
	const innerWidth = Math.max(20, width - 4);

	if (job === undefined) {
		const emptyBody = [
			engine.fg("label", "  OUTPUT"),
			engine.fg("muted", "  No flow jobs yet."),
			...Array.from({ length: contentLines }, () => ""),
			"",
		].slice(0, innerHeight);
		while (emptyBody.length < innerHeight) {
			emptyBody.push("");
		}
		return [divider, ...emptyBody, divider];
	}

	const content = pickContent(job);
	const allLines = content.length > 0 ? wrapLines(content, innerWidth) : ["(no output)"];
	const totalLines = allLines.length;
	const maxScroll = Math.max(0, totalLines - contentLines);
	const clamped = Math.min(scrollOffset, maxScroll);
	const visible = allLines.slice(clamped, clamped + contentLines);
	while (visible.length < contentLines) {
		visible.push("");
	}

	const cwdLine = job.cwd !== undefined
		? engine.fg("dim", `  cwd: ${width > 120 ? job.cwd : basename(job.cwd)}`)
		: "";
	const hintLine = totalLines > contentLines
		? withMotion(
			() => breathe(`  PgUp/PgDn · line ${clamped + 1}/${totalLines}`, palette.semantic.dim, animState),
			engine.fg("dim", `  PgUp/PgDn · line ${clamped + 1}/${totalLines}`),
			reducedMotion,
		)
		: "";

	return [
		divider,
		engine.fg("label", "  OUTPUT"),
		truncateToWidth(cwdLine, width),
		...visible.map((line) => engine.fg("text", `  ${truncateToWidth(line, innerWidth)}`)),
		truncateToWidth(hintLine, width),
		divider,
	];
};
