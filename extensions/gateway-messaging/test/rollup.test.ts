import { describe, expect, it } from "bun:test";
import type { ToolStreamEvent } from "../src/types.js";
import { formatToolStreamRollup } from "../src/rollup.js";

describe("Tool stream rollup formatter", () => {
  it("coalesces repeated tool calls into compact counts", () => {
    const events: ToolStreamEvent[] = [
      { type: "tool_call", name: "read_file" },
      { type: "tool_call", name: "read_file" },
      { type: "tool_result", name: "read_file", ok: true },
      { type: "tool_call", name: "write_file" },
      { type: "tool_result", name: "write_file", ok: false },
      { type: "tool_result", name: "write_file", ok: false },
    ];

    const rolled = formatToolStreamRollup(events);

    expect(rolled).toContain("read_file:2c ✓1");
    expect(rolled).toContain("write_file:1c ✗2");
  });

  it("includes assistant text and error summary lines", () => {
    const events: ToolStreamEvent[] = [
      { type: "text", text: "starting check" },
      { type: "text", text: "writing draft" },
      { type: "error", message: "rate limit" },
    ];

    const rolled = formatToolStreamRollup(events);

    expect(rolled).toContain("text:");
    expect(rolled).toContain("starting check | writing draft");
    expect(rolled).toContain("errors: 1");
    expect(rolled).toContain("last-error: rate limit");
  });
});
