import { basename } from "node:path";
import type { ThemeEngine } from "../../../../shared/theme/engine.js";
import type { Palette, ThemeConfig } from "../../../../shared/theme/types.js";
import { stripAnsi } from "../../../../shared/ui/hud.js";
import { breathe, withMotion, type AnimationState } from "../../../../shared/theme/animation.js";
import type { FlowJob } from "../types.js";
import { truncateToWidth } from "./layout.js";

const CONTROL_RE = /[\x00-\x08\x0b-\x1f]/g;

export const sanitize = (text: string): string =>
	stripAnsi(text).replace(CONTROL_RE, "");

const pickContent = (job: FlowJob): string =>
	sanitize(job.output ?? job.error ?? job.lastAssistantText ?? job.task);

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
	maxLines: number,
	animState: AnimationState,
): string[] => {
	const reducedMotion = !config.animation.enabled || config.animation.reducedMotion;
	const divider = engine.fg("border", "─".repeat(width));

	if (job === undefined) {
		return [
			divider,
			engine.fg("muted", "  No flow jobs yet."),
			divider,
		];
	}

	const innerWidth = Math.max(20, width - 4);
	const content = pickContent(job);
	const allLines = content.length > 0 ? wrapLines(content, innerWidth) : ["(no output)"];

	const totalLines = allLines.length;
	const maxScroll = Math.max(0, totalLines - maxLines);
	const clamped = Math.min(scrollOffset, maxScroll);
	const visible = allLines.slice(clamped, clamped + maxLines);

	const cwdStr =
		job.cwd !== undefined
			? engine.fg("dim", `  cwd: ${width > 120 ? job.cwd : basename(job.cwd)}`)
			: undefined;

	const hasMore = totalLines > maxLines;
	const scrollHint = hasMore
		? withMotion(
			() => breathe(`  PgUp/PgDn · line ${clamped + 1}/${totalLines}`, palette.semantic.dim, animState),
			engine.fg("dim", `  PgUp/PgDn · line ${clamped + 1}/${totalLines}`),
			reducedMotion,
		)
		: undefined;

	return [
		divider,
		engine.fg("label", "  OUTPUT"),
		...(cwdStr !== undefined ? [cwdStr] : []),
		...visible.map((line) => engine.fg("text", `  ${truncateToWidth(line, innerWidth)}`)),
		...(scrollHint !== undefined ? [scrollHint] : []),
		divider,
	];
};
