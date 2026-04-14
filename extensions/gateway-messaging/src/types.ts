import { Type, type Static } from "@sinclair/typebox";

export const GatewayActionKindSchema = Type.Union([
  Type.Literal("retry"),
  Type.Literal("details"),
  Type.Literal("approve"),
  Type.Literal("cancel"),
]);

export const GatewayActionScopeSchema = Type.Union([
  Type.Literal("turn"),
  Type.Literal("message"),
]);

export const GatewayTurnActionSchema = Type.Object(
  {
    v: Type.Literal(1),
    action: GatewayActionKindSchema,
    scope: GatewayActionScopeSchema,
    turnId: Type.String({ minLength: 1, maxLength: 128 }),
    messageId: Type.Integer({ minimum: 1 }),
    nonce: Type.String({ minLength: 1, maxLength: 128 }),
    expiresAt: Type.Optional(Type.String({ minLength: 1 })),
    payload: Type.Optional(
      Type.Record(
        Type.String(),
        Type.Union([Type.String(), Type.Number(), Type.Boolean()]),
      ),
    ),
  },
  { additionalProperties: false },
);

export type GatewayTurnAction = Static<typeof GatewayTurnActionSchema>;

export interface ToolStreamToolCall {
  readonly type: "tool_call";
  readonly name: string;
}

export interface ToolStreamToolResult {
  readonly type: "tool_result";
  readonly name: string;
  readonly ok: boolean;
}

export interface ToolStreamText {
  readonly type: "text";
  readonly text: string;
}

export interface ToolStreamError {
  readonly type: "error";
  readonly message: string;
}

export type ToolStreamEvent =
  | ToolStreamToolCall
  | ToolStreamToolResult
  | ToolStreamText
  | ToolStreamError;

export const DEFAULT_GATEWAY_THROTTLE_MS = 250;

export const GatewayTurnPhaseSchema = Type.Union([
  Type.Literal("queued"),
  Type.Literal("acknowledged"),
  Type.Literal("thinking"),
  Type.Literal("tool_stream"),
  Type.Literal("synthesizing"),
  Type.Literal("final"),
]);

export type GatewayTurnPhase = Static<typeof GatewayTurnPhaseSchema>;

export interface GatewayPhaseEvent {
  readonly type: "phase";
  readonly phase: GatewayTurnPhase;
  readonly summary?: string;
}

export interface GatewayToolStreamEvent {
  readonly type: "tool_stream";
  readonly events: readonly ToolStreamEvent[];
}

export interface GatewayFinalEvent {
  readonly type: "final";
  readonly text: string;
}

export type GatewayTurnEvent = GatewayPhaseEvent | GatewayToolStreamEvent | GatewayFinalEvent;

export type GatewayPatchMode = "edit_primary" | "fallback_auxiliary";

export interface GatewayDispatchContext {
  readonly traceId: string;
  readonly nowMs: number;
  readonly actorId: string | undefined;
  readonly allowedActorIds: readonly string[];
  readonly activeTurnId: string;
  readonly activeMessageId: number | undefined;
  readonly currentPhase: GatewayTurnPhase;
}

export type GatewayDispatchRejectReason =
  | "unauthorized"
  | "expired"
  | "stale_turn"
  | "stale_message";

export interface GatewayDispatchRejected {
  readonly ok: false;
  readonly traceId: string;
  readonly reason: GatewayDispatchRejectReason;
}

export interface GatewayDispatchAccepted {
  readonly ok: true;
  readonly traceId: string;
  readonly nextPhase: GatewayTurnPhase;
  readonly operation: GatewayTurnAction["action"];
  readonly uiText: string;
}

export type GatewayDispatchResult = GatewayDispatchAccepted | GatewayDispatchRejected;

export const DiscordDestinationKindSchema = Type.Union([
  Type.Literal("channel"),
  Type.Literal("thread"),
]);

export const GatewayDiscordDestinationSchema = Type.Object({
  platform: Type.Literal("discord"),
  kind: DiscordDestinationKindSchema,
  id: Type.String({ minLength: 1 }),
  threadId: Type.Optional(Type.String({ minLength: 1 })),
});

export type GatewayDiscordDestination = Static<typeof GatewayDiscordDestinationSchema>;

export const GatewayDiscordModerationActionSchema = Type.Union([
  Type.Literal("delete_message"),
  Type.Literal("timeout_member"),
  Type.Literal("kick_member"),
  Type.Literal("ban_member"),
  Type.Literal("unban_member"),
  Type.Literal("mute_member"),
  Type.Literal("move_member"),
]);

export type GatewayDiscordModerationAction = Static<typeof GatewayDiscordModerationActionSchema>;
