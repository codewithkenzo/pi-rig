import { formatToolStreamRollup } from "./rollup.js";
import type {
  GatewayPatchMode,
  GatewayTurnAction,
  GatewayTurnEvent,
  GatewayTurnPhase,
} from "./types.js";

const phaseHeadline = (phase: GatewayTurnPhase): string => {
  switch (phase) {
    case "queued":
      return "Queued";
    case "acknowledged":
      return "Working";
    case "thinking":
      return "Thinking";
    case "tool_stream":
      return "Tool activity";
    case "synthesizing":
      return "Synthesizing";
    case "final":
      return "Final";
    default: {
      const exhaustive: never = phase;
      throw new Error(`Unhandled phase: ${exhaustive}`);
    }
  }
};

const formatActionHint = (action: GatewayTurnAction | undefined): string | undefined => {
  if (action === undefined) {
    return undefined;
  }
  return `action:${action.action}`;
};

const formatEventBody = (event: GatewayTurnEvent): string | undefined => {
  switch (event.type) {
    case "phase":
      return event.summary;
    case "tool_stream":
      return formatToolStreamRollup(event.events);
    case "final":
      return event.text;
    default: {
      const exhaustive: never = event;
      throw new Error(`Unhandled event type: ${JSON.stringify(exhaustive)}`);
    }
  }
};

export const resolvePatchMode = (canEditPrimary: boolean): GatewayPatchMode =>
  canEditPrimary ? "edit_primary" : "fallback_auxiliary";

export const buildGatewayTurnPatchText = (params: {
  phase: GatewayTurnPhase;
  event: GatewayTurnEvent;
  action: GatewayTurnAction | undefined;
  mode: GatewayPatchMode;
}): string => {
  const lines = [`${phaseHeadline(params.phase)} (${params.mode})`];
  const body = formatEventBody(params.event);
  if (body !== undefined && body.trim().length > 0) {
    lines.push(body.trim());
  }
  const actionHint = formatActionHint(params.action);
  if (actionHint !== undefined) {
    lines.push(actionHint);
  }
  return lines.join("\n");
};
