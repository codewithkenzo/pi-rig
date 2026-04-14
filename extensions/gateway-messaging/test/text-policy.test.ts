import { describe, expect, it } from "bun:test";
import { buildGatewayTurnPatchText, resolvePatchMode } from "../src/text-policy.js";

describe("gateway text policy", () => {
  it("renders rollup text for tool stream updates", () => {
    const patch = buildGatewayTurnPatchText({
      phase: "tool_stream",
      mode: "edit_primary",
      event: {
        type: "tool_stream",
        events: [
          { type: "tool_call", name: "search" },
          { type: "tool_result", name: "search", ok: true },
        ],
      },
      action: undefined,
    });

    expect(patch).toContain("Tool activity");
    expect(patch).toContain("search:1c ✓1");
  });

  it("renders final text and action hint", () => {
    const patch = buildGatewayTurnPatchText({
      phase: "final",
      mode: "fallback_auxiliary",
      event: {
        type: "final",
        text: "Complete.",
      },
      action: {
        v: 1,
        action: "approve",
        scope: "turn",
        turnId: "t1",
        messageId: 42,
        nonce: "n-1",
      },
    });

    expect(patch).toContain("Final (fallback_auxiliary)");
    expect(patch).toContain("Complete.");
    expect(patch).toContain("action:approve");
  });

  it("maps edit capability to patch mode", () => {
    expect(resolvePatchMode(true)).toBe("edit_primary");
    expect(resolvePatchMode(false)).toBe("fallback_auxiliary");
  });
});
