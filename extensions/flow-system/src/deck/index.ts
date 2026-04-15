// deck/index.ts — showFlowDeck() — 3-zone TUI overlay
// Call showFlowManager() in commands.ts (not this directly) for the capability gate.

import { Effect } from "effect";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey } from "@mariozechner/pi-tui";
import { AnimationTicker } from "../../../../shared/theme/animation.js";
import { loadTheme } from "../../../../shared/theme/index.js";
import type { FlowQueueService } from "../queue.js";
import type { FlowQueue } from "../types.js";
import {
	makeInitialDeckState,
	clampSelection,
	updateFeedFromSnapshot,
	type DeckState,
} from "./state.js";
import { DECK_ICONS } from "./icons.js";
import { renderHeader } from "./header.js";
import { renderColumns } from "./columns.js";
import { renderSummary } from "./summary.js";
import { renderFooter } from "./footer.js";

type CustomFn = NonNullable<ExtensionCommandContext["ui"]["custom"]>;

// ANSI key sequences
const PGUP    = "\x1b[5~";
const PGDN    = "\x1b[6~";
const SHIFT_UP = "\x1b[1;2A";
const SHIFT_DN = "\x1b[1;2B";

const SCROLL_STEP = 5;
const SUMMARY_LINES_WIDE = 8;
const SUMMARY_LINES_COMPACT = 5;

export const showFlowDeck = async (
	queue: FlowQueueService,
	ctx: Pick<ExtensionCommandContext, "cwd" | "ui">,
): Promise<void> => {
	const custom = (ctx.ui as { custom?: CustomFn }).custom;
	if (typeof custom !== "function") {
		// Hard guard — callers should use showFlowManager which gates this
		const snap = await Effect.runPromise(queue.snapshot());
		const lines = snap.jobs.map(
			(j) => `${j.status === "running" ? "▶" : "○"} ${j.profile} · ${j.task}`,
		);
		ctx.ui.notify(lines.length > 0 ? lines.join("\n") : "No flow jobs.");
		return;
	}

	await custom<void>(
		(tui, _theme, _kb, done) => {
			const cwd = ctx.cwd;
			let state: DeckState = makeInitialDeckState(queue.peek());
			const ticker = new AnimationTicker();

			const theme = () => loadTheme(cwd);

			const syncTicker = (): void => {
				const { config } = theme();
				const hasRunning = state.snapshot.jobs.some((j) => j.status === "running");
				const fps = Math.min(8, Math.max(4, config.animation.fps));
				if (config.animation.enabled && !config.animation.reducedMotion && hasRunning) {
					if (!ticker.running) {
						ticker.start(fps, () => tui.requestRender());
					}
				} else {
					ticker.stop();
				}
			};

			const unsubscribe = queue.subscribe((next: FlowQueue) => {
				state = { ...state, snapshot: next };
				state = clampSelection(state);
				state = updateFeedFromSnapshot(state);
				syncTicker();
				tui.requestRender();
			});

			syncTicker();

			const flashKey = (key: string): void => {
				if (state.key_flash.flash_timeout !== null) {
					clearTimeout(state.key_flash.flash_timeout);
				}
				const t = setTimeout(() => {
					state = { ...state, key_flash: { active_key: null, flash_timeout: null } };
					tui.requestRender();
				}, 120);
				state = { ...state, key_flash: { active_key: key, flash_timeout: t } };
			};

			const selectedJob = (): (typeof state.snapshot.jobs)[number] | undefined =>
				state.snapshot.jobs.find((j) => j.id === state.selected_id);

			const jobList = (): typeof state.snapshot.jobs => state.snapshot.jobs;

			return {
				dispose: () => {
					unsubscribe();
					ticker.stop();
					if (state.key_flash.flash_timeout !== null) {
						clearTimeout(state.key_flash.flash_timeout);
					}
				},
				invalidate: () => {},

				handleInput: (data: string) => {
					// Exit
					if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
						flashKey(data === "\x1b" ? "esc" : "^C");
						done(undefined);
						return;
					}

					// Cancel selected job
					if (data === "c" || data === "C") {
						const job = selectedJob();
						if (job !== undefined) {
							flashKey("c");
							void Effect.runPromise(queue.cancel(job.id).pipe(Effect.result));
						}
						tui.requestRender();
						return;
					}

					// Selection navigation
					if (matchesKey(data, Key.up)) {
						const list = jobList();
						const idx = list.findIndex((j) => j.id === state.selected_id);
						if (idx > 0) {
							state = { ...state, selected_id: list[idx - 1]!.id, scroll_offset: 0 };
						}
						flashKey("↑");
						tui.requestRender();
						return;
					}

					if (matchesKey(data, Key.down)) {
						const list = jobList();
						const idx = list.findIndex((j) => j.id === state.selected_id);
						if (idx >= 0 && idx < list.length - 1) {
							state = { ...state, selected_id: list[idx + 1]!.id, scroll_offset: 0 };
						}
						flashKey("↓");
						tui.requestRender();
						return;
					}

					// Scroll output
					if (data === PGUP || data === SHIFT_UP) {
						state = { ...state, scroll_offset: Math.max(0, state.scroll_offset - SCROLL_STEP) };
						flashKey("PgUp");
						tui.requestRender();
						return;
					}

					if (data === PGDN || data === SHIFT_DN) {
						state = { ...state, scroll_offset: state.scroll_offset + SCROLL_STEP };
						flashKey("PgDn");
						tui.requestRender();
						return;
					}
				},

				render: (width: number) => {
					const compact = width < 96;
					const veryNarrow = width < 60;
					state = { ...state, compact };

					const { engine, palette, config } = theme();
					const animState = ticker.current;

					// Empty state
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

					const job = selectedJob();
					const summaryLines = compact ? SUMMARY_LINES_COMPACT : SUMMARY_LINES_WIDE;

					return [
						...renderHeader(engine, palette, config, state.snapshot, animState, width, compact),
						...renderColumns(engine, palette, config, job, state.feed, animState, width, compact),
						...renderSummary(engine, palette, config, job, state.scroll_offset, width, summaryLines, animState),
						...renderFooter(engine, state.key_flash, width, compact, veryNarrow),
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
};
