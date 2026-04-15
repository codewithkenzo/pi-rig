// deck/header.ts — Zone 1: title bar, status badge, clock

import type { ThemeEngine } from "../../../../shared/theme/engine.js";
import type { Palette, ThemeConfig } from "../../../../shared/theme/types.js";
import { shimmer, pulse, withMotion, type AnimationState } from "../../../../shared/theme/animation.js";
import type { FlowQueue } from "../types.js";
import { DECK_ICONS } from "./icons.js";

const clock = (compact: boolean): string => {
	const now = new Date();
	const h = String(now.getHours()).padStart(2, "0");
	const m = String(now.getMinutes()).padStart(2, "0");
	const s = String(now.getSeconds()).padStart(2, "0");
	return compact ? `${h}:${m}` : `${h}:${m}:${s}`;
};

type StatusTone = "active" | "warning" | "success" | "muted" | "error";

const overallStatus = (queue: FlowQueue): { label: string; tone: StatusTone } => {
	const { jobs } = queue;
	if (jobs.some((j) => j.status === "running"))  return { label: "RUNNING", tone: "active" };
	if (jobs.some((j) => j.status === "pending"))  return { label: "PENDING", tone: "warning" };
	if (jobs.some((j) => j.status === "failed"))   return { label: "FAILED",  tone: "error" };
	if (jobs.length === 0)                          return { label: "IDLE",    tone: "muted" };
	return { label: "DONE", tone: "success" };
};

export const renderHeader = (
	engine: ThemeEngine,
	palette: Palette,
	config: ThemeConfig,
	queue: FlowQueue,
	animState: AnimationState,
	width: number,
	compact: boolean,
): string[] => {
	const reducedMotion = !config.animation.enabled || config.animation.reducedMotion;
	const hasRunning = queue.jobs.some((j) => j.status === "running");
	const status = overallStatus(queue);

	const titlePlain = `${DECK_ICONS.agent} FLOW DECK`;
	const animatedTitle = withMotion(
		() => shimmer(titlePlain, palette.semantic.label, palette.semantic.accent, animState, 4),
		engine.fg("label", titlePlain),
		reducedMotion || !hasRunning,
	);

	const badgePlain = `● ${status.label}`;
	const animatedBadge = hasRunning
		? withMotion(
			() => pulse(badgePlain, palette.semantic[status.tone], animState, 1.5),
			engine.fg(status.tone, badgePlain),
			reducedMotion,
		)
		: engine.fg(status.tone, badgePlain);

	const timeStr = clock(compact);
	const time = engine.fg("dim", timeStr);

	// Right-align the clock: measure plain widths only
	const plainMiddle = `  ${titlePlain}  ${badgePlain}`;
	const gap = Math.max(1, width - plainMiddle.length - timeStr.length - 2);

	const line = `  ${animatedTitle}  ${animatedBadge}${" ".repeat(gap)}${time}`;
	const divider = engine.fg("border", "─".repeat(width));

	return [divider, line, divider];
};
