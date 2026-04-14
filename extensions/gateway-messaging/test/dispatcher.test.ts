import { describe, expect, it } from "bun:test";
import { dispatchGatewayTurnAction } from "../src/dispatcher.js";
import type { GatewayTurnAction } from "../src/types.js";

const baseAction: GatewayTurnAction = {
  v: 1,
  action: "retry",
  scope: "message",
  turnId: "turn-1",
  messageId: 100,
  nonce: "n-1",
};

describe("gateway action dispatcher", () => {
  it("accepts valid actions and maps to deterministic phase updates", () => {
    const result = dispatchGatewayTurnAction(baseAction, {
      traceId: "trace-a",
      nowMs: 1_000,
      actorId: "u1",
      allowedActorIds: ["u1", "u2"],
      activeTurnId: "turn-1",
      activeMessageId: 100,
      currentPhase: "thinking",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.traceId).toBe("trace-a");
      expect(result.operation).toBe("retry");
      expect(result.nextPhase).toBe("queued");
    }
  });

  it("rejects unauthorized actor", () => {
    const result = dispatchGatewayTurnAction(baseAction, {
      traceId: "trace-b",
      nowMs: 1_000,
      actorId: "u3",
      allowedActorIds: ["u1", "u2"],
      activeTurnId: "turn-1",
      activeMessageId: 100,
      currentPhase: "thinking",
    });

    expect(result).toEqual({ ok: false, traceId: "trace-b", reason: "unauthorized" });
  });

  it("rejects expired action", () => {
    const result = dispatchGatewayTurnAction(
      {
        ...baseAction,
        expiresAt: "1970-01-01T00:00:00.000Z",
      },
      {
        traceId: "trace-c",
        nowMs: 1_000,
        actorId: undefined,
        allowedActorIds: [],
        activeTurnId: "turn-1",
        activeMessageId: 100,
        currentPhase: "thinking",
      },
    );

    expect(result).toEqual({ ok: false, traceId: "trace-c", reason: "expired" });
  });

  it("rejects stale message for message-scoped action", () => {
    const result = dispatchGatewayTurnAction(baseAction, {
      traceId: "trace-d",
      nowMs: 1_000,
      actorId: undefined,
      allowedActorIds: [],
      activeTurnId: "turn-1",
      activeMessageId: 999,
      currentPhase: "thinking",
    });

    expect(result).toEqual({ ok: false, traceId: "trace-d", reason: "stale_message" });
  });

  it("allows details action to keep current phase", () => {
    const result = dispatchGatewayTurnAction(
      {
        ...baseAction,
        action: "details",
        scope: "turn",
      },
      {
        traceId: "trace-e",
        nowMs: 1_000,
        actorId: undefined,
        allowedActorIds: [],
        activeTurnId: "turn-1",
        activeMessageId: 100,
        currentPhase: "tool_stream",
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nextPhase).toBe("tool_stream");
    }
  });
});
