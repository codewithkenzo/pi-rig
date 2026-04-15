import { describe, it, expect } from "bun:test";
import {
	makeInitialDeckState,
	clampSelection,
	updateFeedFromSnapshot,
} from "../src/deck/state.js";
import type { FlowJob, FlowQueue } from "../src/types.js";

const job = (id: string, overrides: Partial<FlowJob> = {}): FlowJob => ({
	id,
	profile: "test",
	task: "do something",
	status: "pending",
	createdAt: 1000,
	...overrides,
});

const queue = (jobs: FlowJob[]): FlowQueue => ({ jobs, mode: "sequential" });

describe("makeInitialDeckState", () => {
	it("selects first job by default", () => {
		const s = makeInitialDeckState(queue([job("a"), job("b")]));
		expect(s.selected_id).toBe("a");
	});

	it("has empty feed on init", () => {
		const s = makeInitialDeckState(queue([job("a")]));
		expect(s.feed.lines).toHaveLength(0);
		expect(s.feed.last_progress).toBeUndefined();
		expect(s.feed.last_assistant).toBeUndefined();
	});

	it("selected_id is undefined when no jobs", () => {
		const s = makeInitialDeckState(queue([]));
		expect(s.selected_id).toBeUndefined();
	});
});

describe("clampSelection", () => {
	it("keeps valid selected_id unchanged", () => {
		const s = makeInitialDeckState(queue([job("a"), job("b")]));
		const s2 = { ...s, selected_id: "b" as string | undefined };
		expect(clampSelection(s2).selected_id).toBe("b");
	});

	it("clamps to first job when selected is gone", () => {
		const q = queue([job("a")]);
		const s = { ...makeInitialDeckState(queue([job("b")])), selected_id: "b" as string | undefined, snapshot: q };
		expect(clampSelection(s).selected_id).toBe("a");
	});

	it("returns undefined selected_id when queue is empty", () => {
		const q = queue([]);
		const s = { ...makeInitialDeckState(q), selected_id: "gone" as string | undefined };
		expect(clampSelection(s).selected_id).toBeUndefined();
	});

	it("resets scroll_offset when clamping", () => {
		const q = queue([job("a")]);
		const s = {
			...makeInitialDeckState(queue([job("b")])),
			selected_id: "b" as string | undefined,
			scroll_offset: 10,
			snapshot: q,
		};
		expect(clampSelection(s).scroll_offset).toBe(0);
	});
});

describe("updateFeedFromSnapshot — dedupe", () => {
	it("appends new lastProgress to feed", () => {
		const j = job("a", { status: "running", lastProgress: "doing work" });
		let s = makeInitialDeckState(queue([j]));
		s = updateFeedFromSnapshot(s);
		expect(s.feed.lines).toHaveLength(1);
		expect(s.feed.lines[0]?.text).toBe("doing work");
	});

	it("does not duplicate identical progress text on second call", () => {
		const j = job("a", { status: "running", lastProgress: "same text" });
		let s = makeInitialDeckState(queue([j]));
		s = updateFeedFromSnapshot(s);
		s = updateFeedFromSnapshot(s); // second call, same snapshot
		expect(s.feed.lines).toHaveLength(1);
	});

	it("appends new entry when progress changes", () => {
		const j1 = job("a", { status: "running", lastProgress: "step one" });
		let s = makeInitialDeckState(queue([j1]));
		s = updateFeedFromSnapshot(s);

		const j2 = job("a", { status: "running", lastProgress: "step two" });
		s = { ...s, snapshot: queue([j2]) };
		s = updateFeedFromSnapshot(s);

		expect(s.feed.lines).toHaveLength(2);
	});

	it("appends both progress and assistant text when both are new", () => {
		const j = job("a", { status: "running", lastProgress: "tool done", lastAssistantText: "thinking…" });
		let s = makeInitialDeckState(queue([j]));
		s = updateFeedFromSnapshot(s);
		// progress + assistant are different strings → 2 entries
		expect(s.feed.lines.length).toBe(2);
	});

	it("does not append for missing selected job", () => {
		const j = job("a", { status: "running", lastProgress: "something" });
		let s = makeInitialDeckState(queue([j]));
		s = { ...s, selected_id: "does-not-exist" };
		s = updateFeedFromSnapshot(s);
		expect(s.feed.lines).toHaveLength(0);
	});
});
