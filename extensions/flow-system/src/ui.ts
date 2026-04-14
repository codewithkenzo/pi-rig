import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { AnimationTicker, createEngine, loadTheme, shimmer, spin, withMotion } from "../../../shared/theme/index.js";
import type { FlowQueueService } from "./queue.js";
import type { FlowJob, FlowQueue } from "./types.js";

const FLOW_STATUS_KEY = "flow-system";
const FLOW_WIDGET_KEY = "flow-system";

interface LinesComponent {
	render(width: number): string[];
	invalidate(): void;
	dispose?(): void;
}

interface WidgetTui {
	requestRender(force?: boolean): void;
}

const bold = (text: string): string => `\x1b[1m${text}\x1b[22m`;
const dim = (text: string): string => `\x1b[2m${text}\x1b[22m`;

const formatCount = (jobs: readonly FlowJob[], status: FlowJob["status"]): number =>
	jobs.filter((job) => job.status === status).length;

const truncate = (text: string, width: number): string =>
	text.length <= width ? text : `${text.slice(0, Math.max(0, width - 1))}…`;

const ANSI_PATTERN = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

const fitLine = (line: string, width: number): string => {
	const safeWidth = Math.max(1, width);
	const plain = line.replace(ANSI_PATTERN, "");
	if (plain.length <= safeWidth) {
		return line;
	}
	return plain.slice(0, safeWidth);
};

const formatChain = (queue: FlowQueue, limit = 3): string => {
	const active = queue.jobs
		.filter((job) => job.status === "running" || job.status === "pending")
		.slice(0, limit)
		.map((job) => `${job.status === "running" ? "▶" : "○"}${job.profile}`);
	return active.length === 0 ? "idle" : active.join(" → ");
};

const summarizeCounts = (queue: FlowQueue): string => {
	const running = formatCount(queue.jobs, "running");
	const pending = formatCount(queue.jobs, "pending");
	const failed = formatCount(queue.jobs, "failed");
	const chain = formatChain(queue);
	return `run ${running} · wait ${pending}${failed > 0 ? ` · fail ${failed}` : ""} · ${chain}`;
};

export const flowStatusText = (queue: FlowQueue): string | undefined =>
	queue.jobs.length === 0 ? undefined : summarizeCounts(queue);

export const renderFlowWidgetLines = (
	queue: FlowQueue,
	cwd: string,
	animationState = { frame: 0, startedAt: Date.now() },
): string[] => {
	const { config, palette } = loadTheme(cwd);
	const engine = createEngine(palette, config.colorMode);
	const reducedMotion = !config.animation.enabled || config.animation.reducedMotion;
	const activeJobs = queue.jobs.filter((job) => job.status === "running" || job.status === "pending");
	const spinnerFrames = palette.animations?.toolFrames ?? palette.animations?.runningFrames ?? ["◐", "◓", "◑", "◒"];
	const spinner = withMotion(
		() => spin(spinnerFrames, animationState, Math.max(4, config.animation.fps)),
		palette.animations?.pendingSymbol ?? "•",
		reducedMotion,
	);
	const title = withMotion(
		() => shimmer("flow harness", palette.semantic.label, palette.semantic.accent, animationState, 4),
		engine.fg("label", "flow harness"),
		reducedMotion,
	);

	const countsLine = [
		engine.fg("active", `▶ ${formatCount(queue.jobs, "running")}`),
		engine.fg("warning", `○ ${formatCount(queue.jobs, "pending")}`),
		engine.fg("success", `✓ ${formatCount(queue.jobs, "done")}`),
		engine.fg("error", `✗ ${formatCount(queue.jobs, "failed")}`),
		engine.fg("muted", `⊘ ${formatCount(queue.jobs, "cancelled")}`),
	].join("  ");

	const lines = [`${spinner} ${bold(title)} · ${countsLine}`];

	if (activeJobs.length === 0) {
		lines.push(dim("chain idle"));
	} else {
		const chain = activeJobs
			.slice(0, 3)
			.map((job) => `${job.status === "running" ? "▶" : "○"}${job.profile}`)
			.join(" → ");
		lines.push(`chain ${chain}`);
		lines.push(
			truncate(
				activeJobs
					.slice(0, 1)
					.map((job) => {
						const tools = job.toolCount !== undefined ? ` · tools ${job.toolCount}` : "";
						const progress = job.lastProgress !== undefined ? ` · ${job.lastProgress}` : "";
						return `${job.profile}: ${job.task}${tools}${progress}`;
					})
					.join(""),
				72,
			),
		);
	}

	lines.push(dim("/flow run <profile> -- <task> · /flow status · alt+shift+f"));
	return lines;
};

const makeLinesComponent = (getLines: () => string[]): LinesComponent => {
	let cached = getLines();
	return {
		render: (width: number) => cached.map((line) => fitLine(line, width)),
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
		const shouldAnimate = config.animation.enabled && !config.animation.reducedMotion;
		const unsubscribe = queue.subscribe(() => {
			component.invalidate();
			tui.requestRender();
		});

		if (shouldAnimate) {
			ticker.start(Math.max(4, config.animation.fps), () => {
				component.invalidate();
				tui.requestRender();
			});
		}

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
	const updateStatus = (snapshot: FlowQueue): void => {
		ctx.ui.setStatus(FLOW_STATUS_KEY, flowStatusText(snapshot));
	};

	const unsubscribe = queue.subscribe((snapshot) => {
		updateStatus(snapshot);
	});

	ctx.ui.setWidget(FLOW_WIDGET_KEY, createFlowWidgetFactory(queue, ctx.cwd), {
		placement: "belowEditor",
	});
	updateStatus(queue.peek());

	return () => {
		unsubscribe();
		ctx.ui.setStatus(FLOW_STATUS_KEY, undefined);
		ctx.ui.setWidget(FLOW_WIDGET_KEY, undefined);
	};
};
