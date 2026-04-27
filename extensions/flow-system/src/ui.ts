import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { AnimationTicker, createEngine, loadTheme, shimmer, spin, withMotion } from "../../../shared/theme/index.js";
import { ellipsize, fitAnsiLine, joinCompact, metric, tag } from "../../../shared/ui/hud.js";
import { sanitizeFlowText } from "./sanitize.js";

import type { FlowQueueService } from "./queue.js";
import type { FlowJob, FlowQueue } from "./types.js";
import { selectCompactFlowStatusLine, selectFlowStatusState } from "./deck/selectors.js";

const FLOW_STATUS_KEY = "flow-system";
const FLOW_WIDGET_KEY = "flow-system";

let flowHudSuspendDepth = 0;
const flowHudSuspendListeners = new Set<() => void>();

const emitFlowHudSuspendChange = (): void => {
	for (const listener of flowHudSuspendListeners) {
		try {
			listener();
		} catch (error) {
			console.warn("[flow-system] flow HUD suspension listener failed", error);
		}
	}
};

const isFlowHudSuspended = (): boolean => flowHudSuspendDepth > 0;

const subscribeFlowHudSuspendChange = (listener: () => void): (() => void) => {
	flowHudSuspendListeners.add(listener);
	return () => {
		flowHudSuspendListeners.delete(listener);
	};
};

export const suspendFlowHud = (): (() => void) => {
	flowHudSuspendDepth += 1;
	emitFlowHudSuspendChange();
	let released = false;
	return () => {
		if (released) {
			return;
		}
		released = true;
		flowHudSuspendDepth = Math.max(0, flowHudSuspendDepth - 1);
		emitFlowHudSuspendChange();
	};
};

interface LinesComponent {
	render(width: number): string[];
	invalidate(): void;
	dispose?(): void;
}

interface WidgetTui {
	requestRender(force?: boolean): void;
}

const runningJobs = (queue: FlowQueue): FlowJob[] => queue.jobs.filter((job) => job.status === "running");
const activeJobs = (queue: FlowQueue): FlowJob[] => queue.jobs.filter((job) => job.status === "running" || job.status === "pending");
const hasActiveJobs = (queue: FlowQueue): boolean => selectFlowStatusState(queue).counts.active > 0;
const hasRunningJobs = (queue: FlowQueue): boolean => runningJobs(queue).length > 0;
const isWritingSummary = (job: FlowJob | undefined): boolean => job?.status === "running" && job.writingSummary === true;

const normalize = (value: string | undefined): string | undefined => {
	if (value === undefined) {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

const modelStatusValue = (job: FlowJob): string => {
	const model = normalize(job.envelope?.model) ?? normalize(job.model);
	const provider = normalize(job.envelope?.provider);
	if (model === undefined) {
		return "(default)";
	}
	return provider !== undefined ? `${model}@${provider}` : model;
};

const reasoningStatusValue = (job: FlowJob): string => job.envelope?.reasoning ?? "(profile)";
const effortStatusValue = (job: FlowJob): string => job.envelope?.effort ?? "auto";

const toneForStatus = (status: FlowJob["status"]): "active" | "warning" | "success" | "error" | "inactive" => {
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

const staticIconForJob = (job: FlowJob, fallback = "•"): string => {
	switch (job.status) {
		case "running":
			return "▶";
		case "pending":
			return "○";
		case "done":
			return "✓";
		case "failed":
			return "✗";
		case "cancelled":
			return "⊘";
		default:
			return fallback;
	}
};

export const flowStatusText = (
	queue: FlowQueue,
	cwd?: string,
	animationState = { frame: 0, startedAt: Date.now() },
): string | undefined => {
	const status = selectFlowStatusState(queue);
	const primary = status.primaryJob;
	if (status.mode === "idle" || primary === undefined) {
		return undefined;
	}

	if (cwd === undefined) {
		return selectCompactFlowStatusLine(status);
	}

	const { config, palette } = loadTheme(cwd);
	const engine = createEngine(palette, config.colorMode);
	const reducedMotion = !config.animation.enabled || config.animation.reducedMotion;
	const frames = palette.animations?.streamingFrames ?? palette.animations?.runningFrames ?? ["⠋", "⠙", "⠹", "⠸"];
	const icon = hasRunningJobs(queue)
		? withMotion(
				() => spin(frames, animationState, Math.max(6, config.animation.fps)),
				staticIconForJob(primary),
				reducedMotion,
			)
		: staticIconForJob(primary);
	const more = status.counts.active > 1 ? engine.fg("muted", `+${status.counts.active - 1}`) : undefined;
	const summary = status.counts.writingSummary > 0
		? withMotion(
				() =>
					shimmer(
						`writing-summary${status.counts.writingSummary > 1 ? `:${status.counts.writingSummary}` : ""}`,
						palette.semantic.warning,
						palette.semantic.success,
						animationState,
						2,
					),
				engine.fg("success", `writing-summary${status.counts.writingSummary > 1 ? `:${status.counts.writingSummary}` : ""}`),
				reducedMotion,
			)
		: undefined;
	const budget = status.budgetState !== "none" ? engine.fg(status.budgetState === "tracked" ? "muted" : "warning", `budget:${status.budgetState}`) : undefined;
	const model = engine.fg("muted", `m:${ellipsize(modelStatusValue(primary), 24)}`);
	const reasoning = engine.fg("muted", `r:${reasoningStatusValue(primary)}`);
	const effort = engine.fg("muted", `e:${effortStatusValue(primary)}`);
	return joinCompact(engine, [
		engine.fg(toneForStatus(primary.status), icon),
		tag(engine, toneForStatus(primary.status), status.label),
		engine.fg("value", ellipsize(status.activity, 56)),
		model,
		reasoning,
		effort,
		summary,
		budget,
		more,
	]);
};

export const renderFlowWidgetLines = (
	queue: FlowQueue,
	cwd: string,
	animationState = { frame: 0, startedAt: Date.now() },
): string[] => {
	const active = activeJobs(queue);
	if (active.length === 0) {
		return [];
	}

	const { config, palette } = loadTheme(cwd);
	const engine = createEngine(palette, config.colorMode);
	const reducedMotion = !config.animation.enabled || config.animation.reducedMotion;
	const primary = active.find((job) => job.status === "running") ?? active[0];
	if (primary === undefined) {
		return [];
	}

	const frames = palette.animations?.streamingFrames ?? palette.animations?.runningFrames ?? ["⠋", "⠙", "⠹", "⠸"];
	const icon = hasRunningJobs(queue)
		? withMotion(
				() => spin(frames, animationState, Math.max(6, config.animation.fps)),
				staticIconForJob(primary),
				reducedMotion,
			)
		: staticIconForJob(primary);
	const extra = active.length > 1 ? engine.fg("muted", `+${active.length - 1} more`) : undefined;
	const runningCount = active.filter((job) => job.status === "running").length;
	const pendingCount = active.filter((job) => job.status === "pending").length;
	const doneCount = queue.jobs.filter((job) => job.status === "done").length;
	const failedCount = queue.jobs.filter((job) => job.status === "failed").length;
	const summaryCount = active.filter((job) => isWritingSummary(job)).length;
	const title = hasRunningJobs(queue)
		? withMotion(
				() => shimmer("flow stream", palette.semantic.label, palette.semantic.accent, animationState, 3),
				engine.fg("label", "flow stream"),
				reducedMotion,
			)
		: engine.fg("label", "flow stream");

	return [
		joinCompact(engine, [
			engine.fg(toneForStatus(primary.status), icon),
			title,
			metric(engine, "active", "▶", String(runningCount)),
			metric(engine, "warning", "○", String(pendingCount)),
			summaryCount > 0 ? metric(engine, "success", "✍", String(summaryCount)) : undefined,
			doneCount > 0 ? metric(engine, "success", "✓", String(doneCount)) : undefined,
			failedCount > 0 ? metric(engine, "error", "✗", String(failedCount)) : undefined,
			tag(engine, toneForStatus(primary.status), primary.profile),
			extra,
		]),
		joinCompact(engine, [
			engine.fg("accent", "↳"),
			engine.fg("value", ellipsize(sanitizeFlowText(primary.lastAssistantText ?? primary.lastProgress ?? primary.task), 64)),
			isWritingSummary(primary)
				? engine.fg("success", `writing-summary${primary.summaryPhaseSource !== undefined ? `:${primary.summaryPhaseSource}` : ""}`)
				: undefined,
			primary.toolCount !== undefined ? engine.fg("muted", `${primary.toolCount} calls`) : undefined,
			engine.fg("dim", "alt+shift+f manage"),
		]),
	];
};

const makeLinesComponent = (getLines: () => string[]): LinesComponent => {
	let cached = getLines();
	return {
		render: (width: number) => cached.map((line) => fitAnsiLine(line, width)),
		invalidate: () => {
			cached = getLines();
		},
	};
};

export const createFlowWidgetFactory = (queue: FlowQueueService, cwd: string) =>
	(tui: WidgetTui): LinesComponent => {
		const { config } = loadTheme(cwd);
		const ticker = new AnimationTicker();
		const component = makeLinesComponent(() => renderFlowWidgetLines(queue.peek(), cwd, ticker.current));
		const syncTicker = (): void => {
			if (config.animation.enabled && !config.animation.reducedMotion && hasRunningJobs(queue.peek())) {
				if (!ticker.running) {
					ticker.start(Math.max(4, config.animation.fps), () => {
						component.invalidate();
						tui.requestRender();
					});
				}
			} else {
				ticker.stop();
			}
		};
		const unsubscribe = queue.subscribe(() => {
			syncTicker();
			component.invalidate();
			tui.requestRender();
		});
		syncTicker();

		return {
			...component,
			dispose: () => {
				unsubscribe();
				ticker.stop();
			},
		};
	};

export const attachFlowUi = (
	queue: FlowQueueService,
	ctx: ExtensionContext,
): (() => void) => {
	let widgetMounted = false;

	const clearUi = (): void => {
		if (widgetMounted) {
			ctx.ui.setWidget(FLOW_WIDGET_KEY, undefined);
			widgetMounted = false;
		}
		ctx.ui.setStatus(FLOW_STATUS_KEY, undefined);
	};

	const syncUi = (snapshot: FlowQueue): void => {
		if (isFlowHudSuspended()) {
			clearUi();
			return;
		}
		if (!hasActiveJobs(snapshot)) {
			clearUi();
			return;
		}

		if (!widgetMounted) {
			ctx.ui.setWidget(FLOW_WIDGET_KEY, createFlowWidgetFactory(queue, ctx.cwd), { placement: "aboveEditor" });
			widgetMounted = true;
		}
		ctx.ui.setStatus(FLOW_STATUS_KEY, flowStatusText(snapshot, ctx.cwd));
	};

	const unsubscribe = queue.subscribe((snapshot) => {
		syncUi(snapshot);
	});
	const unsubscribeSuspend = subscribeFlowHudSuspendChange(() => {
		syncUi(queue.peek());
	});

	syncUi(queue.peek());

	return () => {
		unsubscribeSuspend();
		unsubscribe();
		clearUi();
	};
};
