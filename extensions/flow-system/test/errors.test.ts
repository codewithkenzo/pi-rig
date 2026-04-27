import { describe, expect, it } from "bun:test";
import { Cause } from "effect";
import { formatFlowError } from "../src/errors.js";
import { SubprocessError } from "../src/types.js";

describe("flow-system error formatting", () => {
	it("falls back to a string for FlowCancelledError-like objects without reason", () => {
		const cause = Cause.fail({ _tag: "FlowCancelledError" });
		expect(formatFlowError(cause)).toBe("Flow cancelled");
	});

	it("keeps cancellation reason when present", () => {
		const cause = Cause.fail({ _tag: "FlowCancelledError", reason: "user cancelled flow" });
		expect(formatFlowError(cause)).toBe("user cancelled flow");
	});

	it("adds marker when subprocess stderr is empty", () => {
		const cause = Cause.fail(new SubprocessError({ exitCode: 7, stderr: "" }));
		const text = formatFlowError(cause);

		expect(text).toContain("[flow-system] child exited without stderr");
		expect(text).toContain("exitCode: 7");
	});
});
