import { basename } from "node:path";
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

const queueCounts = (queue: FlowQueue): { total: number; running: number; pending: number; done: number; failed: number } => ({
	total: queue.jobs.length,
	running: queue.jobs.filter((job) => job.status === "running").length,
	pending: queue.jobs.filter((job) => job.status === "pending").length,
	done: queue.jobs.filter((job) => job.status === "done").length,
	failed: queue.jobs.filter((job) => job.status === "failed").length,
});

const queueSummary = (queue: FlowQueue, compact: boolean): string => {
	const counts = queueCounts(queue);
	const parts = compact
		? [`jobs ${counts.total}`, `run ${counts.running}`, `pend ${counts.pending}`]
		: [`jobs ${counts.total}`, `run ${counts.running}`, `pend ${counts.pending}`, `done ${counts.done}`];
	if (!compact && counts.failed > 0) {
		parts.push(`fail ${counts.failed}`);
	}
	return parts.join(" · ");
};

export const renderHeader = (
	engine: ThemeEngine,
	palette: Palette,
	config: ThemeConfig,
	queue: FlowQueue,
	cwd: string | undefined,
	animState: AnimationState,
	width: number,
	compact: boolean,
): string[] => {
	const reducedMotion = !config.animation.enabled || config.animation.reducedMotion;
	const hasRunning = queue.jobs.some((j) => j.status === "running");
	const status = overallStatus(queue);
	const workspace = cwd === undefined ? undefined : basename(cwd.replace(/\/+$/, "")) || cwd;

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

	const queueText = queueSummary(queue, compact);
	const animatedQueue = engine.fg(compact ? "text" : "value", queueText);
	const workspaceText = workspace !== undefined ? workspace : "(cwd)";
	const animatedWorkspace = engine.fg("muted", workspaceText);
	const modeText = queue.mode === "parallel" ? "parallel" : "sequential";
	const animatedMode = engine.fg("dim", modeText);

	const timeStr = clock(compact);
	const time = engine.fg("dim", timeStr);

	const parts = compact
		? [animatedTitle, animatedQueue, animatedWorkspace]
		: [animatedTitle, animatedBadge, animatedQueue, animatedWorkspace, animatedMode];
	const plainMiddle = parts.map((part) => engine.strip(part)).join("  ");
	const gap = Math.max(1, width - plainMiddle.length - timeStr.length - 2);

	const line = `  ${parts.join("  ")}${" ".repeat(gap)}${time}`;
	const divider = engine.fg("border", "─".repeat(width));

	return [divider, line, divider];
};
