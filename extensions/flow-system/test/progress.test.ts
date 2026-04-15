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
});
