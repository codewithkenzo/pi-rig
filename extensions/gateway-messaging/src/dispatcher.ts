import type {
  GatewayDispatchContext,
  GatewayDispatchResult,
  GatewayTurnAction,
  GatewayTurnPhase,
} from "./types.js";

const isAllowedActor = (actorId: string | undefined, allowedActorIds: readonly string[]): boolean => {
  if (allowedActorIds.length === 0) {
    return true;
  }
  if (actorId === undefined) {
    return false;
  }
  return allowedActorIds.includes(actorId);
};

const isExpired = (action: GatewayTurnAction, nowMs: number): boolean => {
  if (action.expiresAt === undefined) {
    return false;
  }

  const parsed = Date.parse(action.expiresAt);
  if (Number.isNaN(parsed)) {
    return true;
  }

  return parsed <= nowMs;
};

const nextPhaseForAction = (
  action: GatewayTurnAction["action"],
  currentPhase: GatewayTurnPhase,
): { nextPhase: GatewayTurnPhase; uiText: string } => {
  switch (action) {
    case "retry":
      return { nextPhase: "queued", uiText: "Retrying turn." };
    case "details":
      return { nextPhase: currentPhase, uiText: "Opening details." };
    case "approve":
      return { nextPhase: "synthesizing", uiText: "Approved. Synthesizing output." };
    case "cancel":
      return { nextPhase: "final", uiText: "Cancelled by operator." };
    default: {
      const exhaustive: never = action;
      throw new Error(`Unhandled action: ${exhaustive}`);
    }
  }
};

export const dispatchGatewayTurnAction = (
  action: GatewayTurnAction,
  context: GatewayDispatchContext,
): GatewayDispatchResult => {
  if (!isAllowedActor(context.actorId, context.allowedActorIds)) {
    return { ok: false, traceId: context.traceId, reason: "unauthorized" };
  }

  if (isExpired(action, context.nowMs)) {
    return { ok: false, traceId: context.traceId, reason: "expired" };
  }

  if (action.turnId !== context.activeTurnId) {
    return { ok: false, traceId: context.traceId, reason: "stale_turn" };
  }

  if (action.scope === "message" && context.activeMessageId !== action.messageId) {
    return { ok: false, traceId: context.traceId, reason: "stale_message" };
  }

  const next = nextPhaseForAction(action.action, context.currentPhase);
  return {
    ok: true,
    traceId: context.traceId,
    operation: action.action,
    nextPhase: next.nextPhase,
    uiText: next.uiText,
  };
};
