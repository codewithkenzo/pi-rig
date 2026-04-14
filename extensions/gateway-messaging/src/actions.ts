import { Value } from "@sinclair/typebox/value";
import { GatewayTurnActionSchema, type GatewayTurnAction } from "./types.js";

export function parseGatewayTurnAction(payload: string): GatewayTurnAction | undefined {
  try {
    const parsed: unknown = JSON.parse(payload);
    if (Value.Check(GatewayTurnActionSchema, parsed)) {
      return parsed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function formatGatewayTurnAction(action: GatewayTurnAction): string {
  return JSON.stringify(action);
}

export function isGatewayTurnActionPayload(payload: string): boolean {
  return parseGatewayTurnAction(payload) !== undefined;
}
