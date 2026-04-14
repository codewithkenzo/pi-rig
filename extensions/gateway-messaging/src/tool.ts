import { Type } from "@sinclair/typebox";
import type { AgentToolUpdateCallback, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { parseGatewayTurnAction } from "./actions.js";
import { dispatchGatewayTurnAction } from "./dispatcher.js";
import type { GatewayTurnEvent, GatewayTurnPhase, ToolStreamEvent } from "./types.js";
import type { TurnPatchQueueService } from "./turn-state.js";
import { authorizeOperator, loadOperatorAuthPolicy } from "../../../shared/auth/operator.js";
import type { TelegramAdapter } from "./telegram-adapter.js";
import { applyDeepgramHooks, loadDeepgramFlags } from "./deepgram.js";

const emitUpdate = (
  onUpdate: AgentToolUpdateCallback<unknown> | undefined,
  text: string,
): void => {
  onUpdate?.({
    content: [{ type: "text", text }],
    details: undefined,
  });
};

const describePatch = (patch: string): string =>
  patch.length > 220 ? `${patch.slice(0, 217)}…` : patch;

const makePhaseEvent = (phase: GatewayTurnPhase, summary?: string): GatewayTurnEvent =>
  summary === undefined
    ? {
      type: "phase",
      phase,
    }
    : {
      type: "phase",
      phase,
      summary,
    };

export function makeGatewayTurnPreviewTool(queue: TurnPatchQueueService, telegramAdapter: TelegramAdapter) {
  return {
    name: "gateway_turn_preview",
    label: "Gateway turn preview",
    description:
      "Register / coalesce a turn event payload and queue a Telegram single-message patch preview.",
    parameters: Type.Object({
      turn_id: Type.String({ description: "Logical turn identifier", minLength: 1 }),
      chat_id: Type.Integer({ description: "Telegram chat identifier" }),
      phase: Type.Optional(
        Type.Union([
          Type.Literal("queued"),
          Type.Literal("acknowledged"),
          Type.Literal("thinking"),
          Type.Literal("tool_stream"),
          Type.Literal("synthesizing"),
          Type.Literal("final"),
        ]),
      ),
      stream_events: Type.Optional(
        Type.Array(
          Type.Union([
            Type.Object({
              type: Type.Literal("tool_call"),
              name: Type.String({ minLength: 1 }),
            }),
            Type.Object({
              type: Type.Literal("tool_result"),
              name: Type.String({ minLength: 1 }),
              ok: Type.Boolean(),
            }),
            Type.Object({
              type: Type.Literal("text"),
              text: Type.String(),
            }),
            Type.Object({
              type: Type.Literal("error"),
              message: Type.String(),
            }),
          ]),
        ),
      ),
      final_text: Type.Optional(Type.String({ minLength: 1 })),
      inline_action: Type.Optional(
        Type.String({ description: "Optional JSON-encoded inline action" }),
      ),
      actor_id: Type.Optional(Type.String({ minLength: 1 })),
      actor_token: Type.Optional(Type.String({ minLength: 1 })),
      allowed_actor_ids: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
      telegram_bot_token: Type.Optional(Type.String({ minLength: 1 })),
      telegram_thread_id: Type.Optional(Type.Integer({ minimum: 1 })),
      voice_transcript: Type.Optional(Type.String({ minLength: 1 })),
      request_tts: Type.Optional(Type.Boolean()),
      allow_primary_edit: Type.Optional(
        Type.Boolean({ description: "When false, route patch mode to fallback auxiliary" }),
      ),
      force_send: Type.Optional(
        Type.Boolean({ description: "Immediately flush pending patch for this turn." }),
      ),
      message_id: Type.Optional(Type.Integer({ minimum: 1 })),
      trace_id: Type.Optional(Type.String({ minLength: 1 })),
    }),
    execute: async (
      _toolCallId: string,
      params: {
        turn_id: string;
        chat_id: number;
        phase?: GatewayTurnPhase;
        stream_events?: ToolStreamEvent[];
        final_text?: string;
        inline_action?: string;
        actor_id?: string;
        actor_token?: string;
        allowed_actor_ids?: string[];
        telegram_bot_token?: string;
        telegram_thread_id?: number;
        voice_transcript?: string;
        request_tts?: boolean;
        allow_primary_edit?: boolean;
        force_send?: boolean;
        message_id?: number;
        trace_id?: string;
      },
      _signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback<unknown> | undefined,
      _ctx: ExtensionContext,
    ) => {
      const now = Date.now();
      if (params.message_id !== undefined) {
        queue.setMessageId(params.turn_id, params.chat_id, params.message_id);
      }

      const traceId = params.trace_id ?? `${params.turn_id}:${now}`;
      const currentTurn = queue.getTurn(params.turn_id);
      const parsedAction =
        params.inline_action === undefined ? undefined : parseGatewayTurnAction(params.inline_action);
      const policy = loadOperatorAuthPolicy("PI_GATEWAY", params.allowed_actor_ids ?? []);
      const deepgram = applyDeepgramHooks(loadDeepgramFlags(), {
        ...(params.voice_transcript === undefined ? {} : { transcript: params.voice_transcript }),
        ...(params.request_tts === undefined ? {} : { requestTts: params.request_tts }),
        ...(params.final_text === undefined ? {} : { finalText: params.final_text }),
      });

      let actionSummary: string | undefined;
      let actionPhase: GatewayTurnPhase | undefined;

      if (params.inline_action !== undefined && parsedAction === undefined) {
        actionSummary = "Action rejected: invalid schema payload.";
      }

      if (parsedAction !== undefined) {
        const policyAuth = authorizeOperator(policy, params.actor_id, params.actor_token);
        if (!policyAuth.ok) {
          actionSummary = `Action rejected: ${policyAuth.reason ?? "unauthorized"} [trace:${traceId}]`;
        } else {
        const dispatch = dispatchGatewayTurnAction(parsedAction, {
          traceId,
          nowMs: now,
          actorId: params.actor_id,
          allowedActorIds: policy.allowedActorIds,
          activeTurnId: currentTurn?.turnId ?? params.turn_id,
          activeMessageId: currentTurn?.messageId,
          currentPhase: currentTurn?.phase ?? "queued",
        });

        if (dispatch.ok) {
          actionSummary = `${dispatch.uiText} [trace:${dispatch.traceId}]`;
          actionPhase = dispatch.nextPhase;
        } else {
          actionSummary = `Action rejected: ${dispatch.reason} [trace:${dispatch.traceId}]`;
        }
        }
      }

      const stream = params.stream_events ?? [];
      let event: GatewayTurnEvent;

      if (params.final_text !== undefined) {
        event = {
          type: "final",
          text: params.final_text,
        };
      } else if (stream.length > 0) {
        event = {
          type: "tool_stream",
          events: stream,
        };
      } else {
        event = makePhaseEvent(
          params.phase ?? actionPhase ?? currentTurn?.phase ?? "queued",
          deepgram.sttSummary ?? actionSummary,
        );
      }

      const applied = queue.applyEvent({
        turnId: params.turn_id,
        chatId: params.chat_id,
        event,
        now,
        canEditPrimary: params.allow_primary_edit ?? true,
        ...(parsedAction === undefined ? {} : { action: parsedAction }),
      });

      if (params.force_send) {
        const stateBefore = queue.getTurn(params.turn_id);
        queue.forcePatch(params.turn_id);
        const stateAfter = queue.getTurn(params.turn_id);
        emitUpdate(
          onUpdate,
          `Forcing immediate patch flush for turn ${params.turn_id} in chat ${params.chat_id}`,
        );
        if (stateAfter?.lastDispatchedPatch !== stateBefore?.lastDispatchedPatch) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Flushed: ${describePatch(stateAfter?.lastDispatchedPatch ?? "")}`,
              },
            ],
            details: undefined,
          };
        }
      }

      let transportResult: string | undefined;
      const botToken = params.telegram_bot_token;
      const shouldApplyTransport =
        botToken !== undefined &&
        (params.force_send === true || queue.isDue(params.turn_id, now));
      if (shouldApplyTransport) {
        const flushBefore = queue.getTurn(params.turn_id);
        if (flushBefore?.pendingPatch !== undefined) {
          queue.forcePatch(params.turn_id);
          const flushed = queue.getTurn(params.turn_id);
          const patchText = flushed?.lastDispatchedPatch;
          if (patchText !== undefined) {
            const messageId = flushed?.messageId;
            const appliedPatch = await telegramAdapter.applyPatch({
              turnId: params.turn_id,
              botToken,
              chatId: params.chat_id,
              text: patchText,
              ...(params.telegram_thread_id === undefined ? {} : { threadId: params.telegram_thread_id }),
              ...(messageId === undefined ? {} : { messageId }),
            });
            queue.setMessageId(params.turn_id, params.chat_id, appliedPatch.messageId);
            transportResult = `${appliedPatch.strategy}:${appliedPatch.messageId}`;
          }
        }
      }

      const turnState = queue.getTurn(params.turn_id);
      const pending = turnState?.pendingPatch;
      const ageMs =
        pending === undefined || turnState?.pendingSince === undefined
          ? 0
          : now - turnState.pendingSince;

      return {
        content: [
          {
            type: "text" as const,
            text:
              `Queued turn preview for ${params.turn_id}\n` +
              `phase=${applied.phase} mode=${applied.mode} enqueue=${applied.enqueueStatus}\n` +
              `chat=${params.chat_id} pending=${pending !== undefined ? "yes" : "no"}\n` +
              `pending-age=${ageMs}ms dropped=${applied.droppedPatches}\n` +
              `patch=${describePatch(applied.patch)}` +
              `${transportResult === undefined ? "" : `\ntransport=${transportResult}`}` +
              `${deepgram.ttsQueued ? "\ndeepgram_tts=queued" : ""}`,
          },
        ],
        details: deepgram.ttsQueued ? { deepgram_tts: "queued" } : undefined,
      };
    },
  } as const;
}
