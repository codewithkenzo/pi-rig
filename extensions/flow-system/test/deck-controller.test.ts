import { describe, expect, it } from "bun:test";
import {
	makeInitialDeckControllerState,
	moveSelection,
	cyclePanelFocus,
	scrollFocusedPanel,
	syncSnapshot,
	toggleFollowMode,
} from "../src/deck/controller.js";
import { makeFlowActivityJournal } from "../src/deck/journal.js";
import {
	selectCompactFlowStatusLine,
	selectFlowStatusState,
	selectJobById,
	selectStreamRows,
	selectSummaryText,
	selectVisibleStreamRows,
} from "../src/deck/selectors.js";
import type { FlowJob, FlowQueue } from "../src/types.js";

const job = (id: string, overrides: Partial<FlowJob> = {}): FlowJob => ({
	id,
	profile: "explore",
	task: `task-${id}`,
	status: "running",
	createdAt: 1,
	...overrides,
});

const queue = (jobs: FlowJob[]): FlowQueue => ({ jobs, mode: "sequential" });

describe("deck controller", () => {
	it("defaults to first job and queue focus", () => {
		const state = makeInitialDeckControllerState(queue([job("a"), job("b")]));
		expect(state.selectedId).toBe("a");
		expect(state.panelFocus).toBe("queue");
		expect(state.followMode).toBe(true);
	});

	it("resets scroll and follow mode when selection changes", () => {
		const base = {
			...makeInitialDeckControllerState(queue([job("a"), job("b")])),
			panelFocus: "stream" as const,
			streamScroll: 3,
			summaryScroll: 2,
			followMode: false,
		};
		const next = moveSelection(base, 1);
		expect(next.selectedId).toBe("b");
		expect(next.streamScroll).toBe(0);
		expect(next.summaryScroll).toBe(0);
		expect(next.followMode).toBe(true);
	});

	it("cycles panel focus queue -> stream -> summary -> queue", () => {
		const base = makeInitialDeckControllerState(queue([job("a")]));
		expect(cyclePanelFocus(base).panelFocus).toBe("stream");
		expect(cyclePanelFocus(cyclePanelFocus(base)).panelFocus).toBe("summary");
		expect(cyclePanelFocus(cyclePanelFocus(cyclePanelFocus(base))).panelFocus).toBe("queue");
	});

	it("scrolling stream disables follow mode", () => {
		const base = { ...makeInitialDeckControllerState(queue([job("a")])), panelFocus: "stream" as const };
		const next = scrollFocusedPanel(base, 2, { rowCount: 12, pageSize: 5 });
		expect(next.streamScroll).toBe(5);
		expect(next.followMode).toBe(false);
	});

	it("scrolling summary moves summary scroll independently", () => {
		const base = {
			...makeInitialDeckControllerState(queue([job("a")])),
			panelFocus: "summary" as const,
			summaryScroll: 4,
		};
		const next = scrollFocusedPanel(base, -2);
		expect(next.summaryScroll).toBe(6);
		expect(next.streamScroll).toBe(0);
	});

	it("syncSnapshot clamps stale selection", () => {
		const base = { ...makeInitialDeckControllerState(queue([job("a")])), selectedId: "gone" as string | undefined };
		const next = syncSnapshot(base, queue([job("b")]));
		expect(next.selectedId).toBe("b");
	});

	it("prefers newest terminal job when deck idles", () => {
		const state = makeInitialDeckControllerState(
			queue([
				job("old-done", { status: "done", finishedAt: 1 }),
				job("new-failed", { status: "failed", finishedAt: 2 }),
			]),
		);
		expect(state.selectedId).toBe("new-failed");
	});

	it("toggleFollowMode resets stream scroll when re-enabling follow", () => {
		const base = {
			...makeInitialDeckControllerState(queue([job("a")])),
			followMode: false,
			streamScroll: 5,
		};
		const next = toggleFollowMode(base);
		expect(next.followMode).toBe(true);
		expect(next.streamScroll).toBe(0);
	});
});

describe("deck selectors", () => {
	it("prefers journal rows over snapshot fallback", () => {
		const journal = makeFlowActivityJournal();
		journal.append("a", { kind: "assistant", text: "journal row" });
		const rows = selectStreamRows(journal, job("a", { lastProgress: "fallback" }));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.text).toBe("journal row");
	});

	it("falls back to snapshot progress when journal empty", () => {
		const rows = selectStreamRows(makeFlowActivityJournal(), job("a", { lastProgress: "fallback" }));
		expect(rows[0]?.text).toBe("fallback");
	});

	it("selectVisibleStreamRows honors follow mode and scroll offset", () => {
		const rows = Array.from({ length: 6 }, (_, index) => ({
			kind: "assistant" as const,
			text: `row-${index + 1}`,
			ts: index + 1,
		}));
		expect(selectVisibleStreamRows(rows, 3, 0, true).map((row) => row.text)).toEqual(["row-4", "row-5", "row-6"]);
		expect(selectVisibleStreamRows(rows, 3, 1, false).map((row) => row.text)).toEqual(["row-2", "row-3", "row-4"]);
	});

	it("selectVisibleStreamRows stays stable when follow mode is off and new rows append", () => {
		const rows = Array.from({ length: 6 }, (_, index) => ({
			kind: "assistant" as const,
			text: `row-${index + 1}`,
			ts: index + 1,
		}));
		const visibleBefore = selectVisibleStreamRows(rows, 3, 1, false).map((row) => row.text);
		const visibleAfter = selectVisibleStreamRows(
			[...rows, { kind: "assistant" as const, text: "row-7", ts: 7 }],
			3,
			1,
			false,
		).map((row) => row.text);
		expect(visibleBefore).toEqual(["row-2", "row-3", "row-4"]);
		expect(visibleAfter).toEqual(["row-2", "row-3", "row-4"]);
	});

	it("summary precedence follows job state", () => {
		expect(selectSummaryText(job("done", { status: "done", output: "final" }))).toBe("final");
		expect(selectSummaryText(job("failed", { status: "failed", error: "boom" }))).toBe("boom");
	});

	it("selectJobById returns selected job", () => {
		const snapshot = queue([job("a"), job("b")]);
		expect(selectJobById(snapshot, "b")?.id).toBe("b");
	});

	it("selectFlowStatusState derives compact status-line state", () => {
		const snapshot = queue([
			job("queued", { status: "pending" }),
			job("active", {
				status: "running",
				profile: "coder",
				lastProgress: "editing selectors",
				toolCount: 8,
				envelope: {
					reasoning: "medium",
					maxIterations: 40,
					maxToolCalls: 10,
				},
			}),
		]);
		const status = selectFlowStatusState(snapshot);
		expect(status.mode).toBe("flow");
		expect(status.label).toBe("coder");
		expect(status.phase).toBe("running");
		expect(status.counts.active).toBe(2);
		expect(status.budgetState).toBe("warning");
		expect(status.activity).toBe("editing selectors");
	});

	it("selectFlowStatusState treats summary writing as checkpoint state", () => {
		const status = selectFlowStatusState(queue([job("a", { writingSummary: true })]));
		expect(status.phase).toBe("summary");
		expect(status.checkpointState).toBe("summary");
	});

	it("selectCompactFlowStatusLine keeps checkpoint and budget ahead of low-priority meta", () => {
		const status = {
			...selectFlowStatusState(
				queue([
					job("active", {
						status: "running",
						profile: "long-profile-name-for-flow-status-line",
						lastProgress: "editing selectors with a very long progress update that should truncate",
						toolCount: 10,
						writingSummary: true,
						envelope: {
							reasoning: "medium",
							maxIterations: 40,
							maxToolCalls: 10,
						},
					}),
				]),
			),
			label: "long-profile-name-for-flow-status-line",
			activity: "editing selectors with a very long progress update that should truncate",
		} satisfies Parameters<typeof selectCompactFlowStatusLine>[0];

		const line = selectCompactFlowStatusLine(status, { maxChars: 82 });
		expect(line).toContain("writing-summary");
		expect(line).toContain("budget:capped");
		expect(line).toContain("…");
		expect(line).not.toContain("m:");
		expect(line).not.toContain("r:");
		expect(line).not.toContain("e:");
	});

	it("selectCompactFlowStatusLine renders blocked checkpoint state", () => {
		const line = selectCompactFlowStatusLine(
			{
				mode: "flow",
				label: "team-review",
				phase: "blocked",
				tone: "error",
				counts: {
					total: 1,
					active: 1,
					running: 0,
					pending: 0,
					done: 0,
					failed: 1,
					cancelled: 0,
					writingSummary: 0,
				},
				primaryJob: job("blocked", { status: "failed", error: "approval needed" }),
				budgetState: "tracked",
				checkpointState: "blocked",
				activity: "waiting on review",
			},
			{ maxChars: 72 },
		);

		expect(line).toContain("blocked");
		expect(line).toContain("budget:tracked");
	});
});
