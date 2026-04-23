import { Effect } from "effect";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey } from "@mariozechner/pi-tui";
import { AnimationTicker } from "../../../../shared/theme/animation.js";
import { loadTheme } from "../../../../shared/theme/index.js";
import type { FlowQueueService } from "../queue.js";
import type { FlowQueue } from "../types.js";
import type { FlowActivityJournalService } from "./journal.js";
import {
	makeInitialDeckControllerState,
	clampSelection,
	cyclePanelFocus,
	moveSelection,
	scrollFocusedPanel,
	selectedJob,
	setCompactMode,
	setKeyFlash,
	syncSnapshot,
	toggleFollowMode,
	type FlowDeckControllerState,
} from "./controller.js";
import { selectStreamRows, selectVisibleStreamRows } from "./selectors.js";
import { DECK_ICONS } from "./icons.js";
import { renderHeader } from "./header.js";
import { renderColumns } from "./columns.js";
import { renderSummary } from "./summary.js";
import { renderFooter } from "./footer.js";
import { suspendFlowHud } from "../ui.js";

type CustomFn = NonNullable<ExtensionCommandContext["ui"]["custom"]>;

const PGUP = "\x1b[5~";
const PGDN = "\x1b[6~";
const SHIFT_UP = "\x1b[1;2A";
const SHIFT_DN = "\x1b[1;2B";

const SCROLL_STEP = 5;
const SUMMARY_LINES_WIDE = 8;
const SUMMARY_LINES_COMPACT = 5;
const STREAM_LINES_WIDE = 8;
const STREAM_LINES_COMPACT = 5;

export const showFlowDeck = async (
	queue: FlowQueueService,
	journal: FlowActivityJournalService,
	ctx: Pick<ExtensionCommandContext, "cwd" | "ui">,
): Promise<void> => {
	const custom = (ctx.ui as { custom?: CustomFn }).custom;
	if (typeof custom !== "function") {
		const snap = await Effect.runPromise(queue.snapshot());
		const lines = snap.jobs.map(
			(j) => `${j.status === "running" ? "▶" : "○"} ${j.profile} · ${j.task}`,
		);
		ctx.ui.notify(lines.length > 0 ? lines.join("\n") : "No flow jobs.");
		return;
	}

	const releaseHud = suspendFlowHud();
	try {
		await custom<void>(
			(tui, _theme, _kb, done) => {
				const cwd = ctx.cwd;
				let state: FlowDeckControllerState = makeInitialDeckControllerState(queue.peek());
				const ticker = new AnimationTicker();
				let cachedTheme = loadTheme(cwd);
				const theme = () => cachedTheme;

				const syncTicker = (): void => {
					const { config } = theme();
					const hasRunning = state.snapshot.jobs.some((job) => job.status === "running");
					const fps = Math.min(8, Math.max(4, config.animation.fps));
					if (config.animation.enabled && !config.animation.reducedMotion && hasRunning) {
						if (!ticker.running) {
							ticker.start(fps, () => tui.requestRender());
						}
					} else {
						ticker.stop();
					}
				};

				const unsubscribeQueue = queue.subscribe((next: FlowQueue) => {
					cachedTheme = loadTheme(cwd);
					state = clampSelection(syncSnapshot(state, next));
					syncTicker();
					tui.requestRender();
				});
				const unsubscribeJournal = journal.subscribe(() => {
					tui.requestRender();
				});

				syncTicker();

				const flashKey = (key: string): void => {
					if (state.keyFlash.flashTimeout !== null) {
						clearTimeout(state.keyFlash.flashTimeout);
					}
					const timeout = setTimeout(() => {
						state = setKeyFlash(state, null, null);
						tui.requestRender();
					}, 120);
					state = setKeyFlash(state, key, timeout);
				};

				const streamMetrics = (): { rowCount: number; pageSize: number } => {
					const job = selectedJob(state);
					return {
						rowCount: selectStreamRows(journal, job).length,
						pageSize: state.compact ? STREAM_LINES_COMPACT : STREAM_LINES_WIDE,
					};
				};

				return {
					dispose: () => {
						unsubscribeQueue();
						unsubscribeJournal();
						ticker.stop();
						if (state.keyFlash.flashTimeout !== null) {
							clearTimeout(state.keyFlash.flashTimeout);
						}
					},
					invalidate: () => {},
					handleInput: (data: string) => {
						if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
							flashKey(data === "\x1b" ? "esc" : "^C");
							done(undefined);
							return;
						}

						if (data === "\t") {
							state = cyclePanelFocus(state);
							flashKey("tab");
							tui.requestRender();
							return;
						}

						if (data === "f" || data === "F") {
							state = toggleFollowMode(state);
							flashKey("f");
							tui.requestRender();
							return;
						}

						if (data === "r" || data === "R") {
							flashKey("r");
							tui.requestRender(true);
							return;
						}

						if (data === "c" || data === "C") {
							const job = selectedJob(state);
							if (job !== undefined) {
								flashKey("c");
								void Effect.runPromise(queue.cancel(job.id).pipe(Effect.result));
							}
							tui.requestRender();
							return;
						}

						if (matchesKey(data, Key.up)) {
							state =
								state.panelFocus === "queue"
									? moveSelection(state, -1)
									: scrollFocusedPanel(state, 1, streamMetrics());
							flashKey("↑");
							tui.requestRender();
							return;
						}

						if (matchesKey(data, Key.down)) {
							state =
								state.panelFocus === "queue"
									? moveSelection(state, 1)
									: scrollFocusedPanel(state, -1, streamMetrics());
							flashKey("↓");
							tui.requestRender();
							return;
						}

						if (data === PGUP || data === SHIFT_UP) {
							if (state.panelFocus !== "queue") {
								state = scrollFocusedPanel(state, SCROLL_STEP, streamMetrics());
							}
							flashKey("PgUp");
							tui.requestRender();
							return;
						}

						if (data === PGDN || data === SHIFT_DN) {
							if (state.panelFocus !== "queue") {
								state = scrollFocusedPanel(state, -SCROLL_STEP, streamMetrics());
							}
							flashKey("PgDn");
							tui.requestRender();
						}
					},
					render: (width: number) => {
						const compact = width < 96;
						const veryNarrow = width < 60;
						state = setCompactMode(state, compact);

						const { engine, palette, config } = theme();
						const animState = ticker.current;

						if (state.snapshot.jobs.length === 0) {
							const divider = engine.fg("border", "─".repeat(width));
							return [
								divider,
								`  ${engine.fg("label", `${DECK_ICONS.agent} FLOW DECK`)}`,
								divider,
								engine.fg("muted", "  No flow jobs yet."),
								divider,
								engine.fg("dim", "  [esc] close"),
								divider,
							];
						}

						const job = selectedJob(state);
						const summaryLines = compact ? SUMMARY_LINES_COMPACT : SUMMARY_LINES_WIDE;
						const streamRows = selectVisibleStreamRows(
							selectStreamRows(journal, job),
							compact ? STREAM_LINES_COMPACT : STREAM_LINES_WIDE,
							state.streamScroll,
							state.followMode,
						);

						return [
							...renderHeader(engine, palette, config, state.snapshot, animState, width, compact),
							...renderColumns(engine, palette, config, job, streamRows, animState, width, compact),
							...renderSummary(engine, palette, config, job, state.summaryScroll, width, summaryLines, animState),
							...renderFooter(engine, {
								active_key: state.keyFlash.activeKey,
								flash_timeout: state.keyFlash.flashTimeout,
							}, width, compact, veryNarrow),
						];
					},
				};
			},
			{
				overlay: true,
				overlayOptions: {
					anchor: "bottom-center",
					offsetY: -2,
					width: "82%",
					minWidth: 72,
					maxHeight: "88%",
					margin: 1,
				},
			},
		);
	} finally {
		releaseHud();
	}
};
