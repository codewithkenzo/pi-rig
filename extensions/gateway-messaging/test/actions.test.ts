import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { GatewayTurnActionSchema, type GatewayTurnAction } from "../src/types.js";
import {
  formatGatewayTurnAction,
  isGatewayTurnActionPayload,
  parseGatewayTurnAction,
} from "../src/actions.js";

describe("gateway inline action parser", () => {
  const action: GatewayTurnAction = {
    v: 1,
    action: "retry",
    scope: "message",
    turnId: "turn-123",
    messageId: 123,
    nonce: "nonce-123",
    payload: {
      next: "step-2",
      urgent: true,
      attempt: 2,
    },
  };

  it("formats an action into JSON", () => {
    const encoded = formatGatewayTurnAction(action);
    const decoded = parseGatewayTurnAction(encoded);
    expect(decoded).toEqual(action);
  });

  it("accepts valid payloads through schema check", () => {
    const encoded = JSON.stringify(action);
    expect(isGatewayTurnActionPayload(encoded)).toBe(true);
    expect(Value.Check(GatewayTurnActionSchema, JSON.parse(encoded))).toBe(true);
  });

  it("rejects invalid payload versions", () => {
    const encoded = JSON.stringify({
      v: 2,
      action: "retry",
      scope: "turn",
      turnId: "turn-123",
      messageId: 123,
      nonce: "nonce-123",
    });

    expect(parseGatewayTurnAction(encoded)).toBeUndefined();
    expect(isGatewayTurnActionPayload(encoded)).toBe(false);
    expect(Value.Check(GatewayTurnActionSchema, JSON.parse(encoded))).toBe(false);
  });

  it("rejects malformed JSON", () => {
    expect(parseGatewayTurnAction("{oops")).toBeUndefined();
    expect(isGatewayTurnActionPayload("{oops")).toBe(false);
  });

  it("accepts all required ticket action kinds", () => {
    const kinds: GatewayTurnAction["action"][] = ["retry", "details", "approve", "cancel"];
    for (const actionKind of kinds) {
      const encoded = JSON.stringify({ ...action, action: actionKind });
      expect(parseGatewayTurnAction(encoded)?.action).toBe(actionKind);
    }
  });
});
