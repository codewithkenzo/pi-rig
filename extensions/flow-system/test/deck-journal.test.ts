import { describe, expect, it } from "bun:test";
import { makeFlowActivityJournal } from "../src/deck/journal.js";
import { createFlowProgressTracker } from "../src/progress.js";
import type { FlowQueue } from "../src/types.js";

const queue = (jobs: FlowQueue["jobs"]): FlowQueue => ({ jobs, mode: "sequential" });

describe("FlowActivityJournalService", () => {
	it("records normalized progress events per job", () => {
		const journal = makeFlowActivityJournal();
		const tracker = createFlowProgressTracker({ assistantTextThrottleMs: 0, now: (() => {
			let current = 0;
			return () => {
				current += 1;
				return current;
			};
		})() });
		journal.recordProgressEvent("job-1", { _tag: "tool_start", toolName: "grep", detail: "searching" });
		journal.recordProgressEvent("job-1", { _tag: "tool_end", toolName: "grep", detail: "done" });
		const assistantUpdate = tracker.apply({ _tag: "assistant_text", detail: "Working notes" });
		journal.recordProgressEvent("job-1", { _tag: "assistant_text", detail: "Working notes" }, assistantUpdate);
		const summaryUpdate = tracker.apply({ _tag: "summary_state", active: true, source: "explicit" });
		journal.recordProgressEvent("job-1", { _tag: "summary_state", active: true, source: "explicit" }, summaryUpdate);

		const rows = journal.rows("job-1");
		expect(rows.map((row) => row.kind)).toEqual(["tool_start", "tool_end", "assistant", "summary"]);
		expect(rows[0]?.label).toBe("grep");
		expect(rows[3]?.text).toBe("Writing summary…");
	});

	it("dedupes identical consecutive rows", () => {
		const journal = makeFlowActivityJournal();
		journal.append("job-1", { kind: "assistant", text: "same" });
		journal.append("job-1", { kind: "assistant", text: "same" });
		expect(journal.rows("job-1")).toHaveLength(1);
	});

	it("uses tracker-normalized assistant updates instead of raw cumulative deltas", () => {
		const journal = makeFlowActivityJournal();
		const tracker = createFlowProgressTracker({ assistantTextThrottleMs: 1_000, now: () => 1 });
		const first = tracker.apply({ _tag: "assistant_text", detail: "a" });
		const second = tracker.apply({ _tag: "assistant_text", detail: "ab" });
		journal.recordProgressEvent("job-1", { _tag: "assistant_text", detail: "a" }, first);
		journal.recordProgressEvent("job-1", { _tag: "assistant_text", detail: "ab" }, second);

		const rows = journal.rows("job-1");
		expect(rows).toHaveLength(1);
		expect(rows[0]?.text).toBe("a");
	});

	it("tracks queue status transitions", () => {
		const journal = makeFlowActivityJournal();
		journal.syncQueue(queue([{ id: "job-1", profile: "explore", task: "scan", status: "pending", createdAt: 1 }]));
		journal.syncQueue(queue([{ id: "job-1", profile: "explore", task: "scan", status: "running", createdAt: 1 }]));
		journal.syncQueue(queue([{ id: "job-1", profile: "explore", task: "scan", status: "done", createdAt: 1, output: "ok" }]));

		const rows = journal.rows("job-1");
		expect(rows.map((row) => row.label)).toEqual(["pending", "running", "done"]);
		expect(rows.at(-1)?.text).toBe("ok");
	});

	it("drops rows for jobs no longer in queue snapshot", () => {
		const journal = makeFlowActivityJournal();
		journal.syncQueue(queue([{ id: "job-1", profile: "explore", task: "scan", status: "running", createdAt: 1 }]));
		expect(journal.rows("job-1")).toHaveLength(1);
		journal.syncQueue(queue([]));
		expect(journal.rows("job-1")).toHaveLength(0);
	});
});
