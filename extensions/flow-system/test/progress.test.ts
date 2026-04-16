import { describe, expect, it } from "bun:test";
import { createFlowProgressTracker } from "../src/progress.js";

describe("createFlowProgressTracker", () => {
	it("clips assistant text and throttles rapid updates", () => {
		let now = 1000;
		const tracker = createFlowProgressTracker({
			now: () => now,
			assistantTextMaxChars: 20,
			assistantTextThrottleMs: 200,
		});

		const first = tracker.apply({ _tag: "assistant_text", detail: "a".repeat(80) });
		now = 1100;
		const second = tracker.apply({ _tag: "assistant_text", detail: "b".repeat(80) });
		now = 1300;
		const third = tracker.apply({ _tag: "assistant_text", detail: "c".repeat(80) });

		expect(first?.summary.length).toBe(21);
		expect(first?.summary.endsWith("…")).toBe(true);
		expect(second).toBeUndefined();
		expect(third?.summary.startsWith("c")).toBe(true);
		expect(tracker.toolCount).toBe(0);
	});

	it("increments tool count on tool_start and keeps bounded progress text", () => {
		const tracker = createFlowProgressTracker({ progressTextMaxChars: 10 });

		const start = tracker.apply({
			_tag: "tool_start",
			toolName: "bash",
			detail: "tool start detail is very long",
		});
		const end = tracker.apply({
			_tag: "tool_end",
			toolName: "bash",
			detail: "tool end detail is very long",
		});

		expect(tracker.toolCount).toBe(1);
		expect(start?.summary).toBe("tool start…");
		expect(end?.summary).toBe("tool end d…");
	});

	it("keeps explicit writing-summary active until explicit end signal", () => {
		const tracker = createFlowProgressTracker();

		const explicitStart = tracker.apply({ _tag: "summary_state", active: true, source: "explicit" });
		const toolProgress = tracker.apply({ _tag: "tool_start", toolName: "bash", detail: "bash…" });
		const explicitEnd = tracker.apply({ _tag: "summary_state", active: false, source: "explicit" });

		expect(explicitStart?.extras.writingSummary).toBe(true);
		expect(explicitStart?.extras.summaryPhaseSource).toBe("explicit");
		expect(toolProgress?.extras.writingSummary).toBe(true);
		expect(toolProgress?.extras.summaryPhaseSource).toBe("explicit");
		expect(explicitEnd?.extras.writingSummary).toBe(false);
		expect(explicitEnd?.extras.summaryPhaseSource).toBeUndefined();
	});

	it("activates heuristic writing-summary after tools settle and long assistant text", () => {
		let now = 1_000;
		const tracker = createFlowProgressTracker({
			now: () => now,
			summaryHeuristicIdleMs: 200,
			summaryHeuristicMinChars: 20,
			assistantTextThrottleMs: 1_000,
		});

		tracker.apply({ _tag: "tool_start", toolName: "grep", detail: "grep…" });
		tracker.apply({ _tag: "tool_end", toolName: "grep", detail: "grep done" });
		now = 1_250;

		const assistant = tracker.apply({
			_tag: "assistant_text",
			detail: "This is a longer assistant segment that should trigger final summary writing.",
		});

		expect(assistant?.extras.writingSummary).toBe(true);
		expect(assistant?.extras.summaryPhaseSource).toBe("heuristic");
	});

	it("clears heuristic writing-summary when tool activity resumes", () => {
		let now = 1_000;
		const tracker = createFlowProgressTracker({
			now: () => now,
			summaryHeuristicIdleMs: 200,
			summaryHeuristicMinChars: 20,
			assistantTextThrottleMs: 1_000,
		});

		tracker.apply({ _tag: "tool_start", toolName: "grep", detail: "grep…" });
		tracker.apply({ _tag: "tool_end", toolName: "grep", detail: "grep done" });
		now = 1_250;

		const heuristicStart = tracker.apply({
			_tag: "assistant_text",
			detail: "Final summary: here are the results and next steps after running tools.",
		});
		const clearedByTool = tracker.apply({ _tag: "tool_start", toolName: "bash", detail: "bash…" });

		expect(heuristicStart?.extras.writingSummary).toBe(true);
		expect(heuristicStart?.extras.summaryPhaseSource).toBe("heuristic");
		expect(clearedByTool?.extras.writingSummary).toBe(false);
		expect(clearedByTool?.extras.summaryPhaseSource).toBeUndefined();
	});

	it("does not activate heuristic writing-summary for long assistant text without completion cues", () => {
		let now = 1_000;
		const tracker = createFlowProgressTracker({
			now: () => now,
			summaryHeuristicIdleMs: 200,
			summaryHeuristicMinChars: 20,
			assistantTextThrottleMs: 1_000,
		});

		tracker.apply({ _tag: "tool_start", toolName: "grep", detail: "grep…" });
		tracker.apply({ _tag: "tool_end", toolName: "grep", detail: "grep done" });
		now = 1_250;

		const assistant = tracker.apply({
			_tag: "assistant_text",
			detail:
				"This is a long intermediate explanation about options and tradeoffs without concluding language or closure markers.",
		});

		expect(assistant?.extras.writingSummary).toBe(false);
		expect(assistant?.extras.summaryPhaseSource).toBeUndefined();
	});

	it("does not activate heuristic writing-summary when assistant says more tool work is still needed", () => {
		let now = 1_000;
		const tracker = createFlowProgressTracker({
			now: () => now,
			summaryHeuristicIdleMs: 200,
			summaryHeuristicMinChars: 20,
			assistantTextThrottleMs: 1_000,
		});

		tracker.apply({ _tag: "tool_start", toolName: "grep", detail: "grep…" });
		tracker.apply({ _tag: "tool_end", toolName: "grep", detail: "grep done" });
		now = 1_250;

		const assistant = tracker.apply({
			_tag: "assistant_text",
			detail:
				"I have some results from the grep pass, but I still need to run one more bash check and compare outputs before I can give the final answer.",
		});

		expect(assistant?.extras.writingSummary).toBe(false);
		expect(assistant?.extras.summaryPhaseSource).toBeUndefined();
	});

	it("does not activate heuristic writing-summary for forward-looking 'overall' updates", () => {
		let now = 1_000;
		const tracker = createFlowProgressTracker({
			now: () => now,
			summaryHeuristicIdleMs: 200,
			summaryHeuristicMinChars: 20,
			assistantTextThrottleMs: 1_000,
		});

		tracker.apply({ _tag: "tool_start", toolName: "grep", detail: "grep…" });
		tracker.apply({ _tag: "tool_end", toolName: "grep", detail: "grep done" });
		now = 1_250;

		const assistant = tracker.apply({
			_tag: "assistant_text",
			detail:
				"Overall, I found three candidate files; next I'll inspect src/ui.ts for the exact wiring and then compare outputs.",
		});

		expect(assistant?.extras.writingSummary).toBe(false);
		expect(assistant?.extras.summaryPhaseSource).toBeUndefined();
	});

	it("does not activate heuristic writing-summary for planning-style recommendations", () => {
		let now = 1_000;
		const tracker = createFlowProgressTracker({
			now: () => now,
			summaryHeuristicIdleMs: 200,
			summaryHeuristicMinChars: 20,
			assistantTextThrottleMs: 1_000,
		});

		tracker.apply({ _tag: "tool_start", toolName: "grep", detail: "grep…" });
		tracker.apply({ _tag: "tool_end", toolName: "grep", detail: "grep done" });
		now = 1_250;

		const assistant = tracker.apply({
			_tag: "assistant_text",
			detail:
				"Recommendations for next steps: run a targeted bash diff, inspect ui.ts, and then compare outputs before answering.",
		});

		expect(assistant?.extras.writingSummary).toBe(false);
		expect(assistant?.extras.summaryPhaseSource).toBeUndefined();
	});
});
