import {
  type GatewayPatchMode,
  type GatewayTurnAction,
  type GatewayTurnEvent,
  type GatewayTurnPhase,
  DEFAULT_GATEWAY_THROTTLE_MS,
} from "./types.js";
import { buildGatewayTurnPatchText, resolvePatchMode } from "./text-policy.js";

export interface TelegramTurnState {
  readonly turnId: string;
  readonly chatId: number;
  phase: GatewayTurnPhase;
  messageId: number | undefined;
  pendingPatch: string | undefined;
  pendingSince: number | undefined;
  lastDispatchedPatch: string | undefined;
  lastDispatchedAt: number | undefined;
  lastPatchMode: GatewayPatchMode | undefined;
  droppedPatches: number;
  throttleMs: number;
}

export interface PatchQueueEntry {
  readonly turnId: string;
  readonly patch: string;
  readonly chatId: number;
  readonly mode: GatewayPatchMode;
}

export interface EnqueuePatchResult {
  readonly status: "queued" | "noop";
  readonly droppedPatches: number;
}

export interface TurnEventApplyResult {
  readonly turnId: string;
  readonly phase: GatewayTurnPhase;
  readonly mode: GatewayPatchMode;
  readonly patch: string;
  readonly enqueueStatus: EnqueuePatchResult["status"];
  readonly droppedPatches: number;
}

export interface TurnPatchQueueService {
  enqueuePatch(
    turnId: string,
    chatId: number,
    patch: string,
    now: number,
    mode: GatewayPatchMode,
  ): EnqueuePatchResult;
  applyEvent(params: {
    turnId: string;
    chatId: number;
    event: GatewayTurnEvent;
    now: number;
    action?: GatewayTurnAction;
    canEditPrimary?: boolean;
  }): TurnEventApplyResult;
  forcePatch(turnId: string): void;
  setMessageId(turnId: string, chatId: number, messageId: number): void;
  drainDue(now: number): ReadonlyArray<PatchQueueEntry>;
  getTurn(turnId: string): TelegramTurnState | undefined;
  getTurns(): ReadonlyArray<TelegramTurnState>;
  isDue(turnId: string, now: number): boolean;
}

interface MutableTelegramTurnState {
  turnId: string;
  chatId: number;
  phase: GatewayTurnPhase;
  messageId: number | undefined;
  pendingPatch: string | undefined;
  pendingSince: number | undefined;
  lastDispatchedPatch: string | undefined;
  lastDispatchedAt: number | undefined;
  lastPatchMode: GatewayPatchMode | undefined;
  droppedPatches: number;
  throttleMs: number;
}

const makeTurnSnapshot = (state: MutableTelegramTurnState): TelegramTurnState => ({
  ...state,
});

const nextPhaseFromEvent = (event: GatewayTurnEvent): GatewayTurnPhase => {
  switch (event.type) {
    case "phase":
      return event.phase;
    case "tool_stream":
      return "tool_stream";
    case "final":
      return "final";
    default: {
      const exhaustive: never = event;
      throw new Error(`Unhandled event: ${JSON.stringify(exhaustive)}`);
    }
  }
};

export const makeTurnStateQueue = (throttleMs = DEFAULT_GATEWAY_THROTTLE_MS): TurnPatchQueueService => {
  const store = new Map<string, MutableTelegramTurnState>();

  const getOrCreate = (turnId: string, chatId: number): MutableTelegramTurnState => {
    const existing = store.get(turnId);
    if (existing !== undefined) {
      if (existing.chatId !== chatId) {
        existing.chatId = chatId;
      }
      return existing;
    }

    const created: MutableTelegramTurnState = {
      turnId,
      chatId,
      phase: "queued",
      messageId: undefined,
      pendingPatch: undefined,
      pendingSince: undefined,
      lastDispatchedPatch: undefined,
      lastDispatchedAt: undefined,
      lastPatchMode: undefined,
      droppedPatches: 0,
      throttleMs,
    };

    store.set(turnId, created);
    return created;
  };

  const shouldDropForThrottle = (state: MutableTelegramTurnState, now: number): boolean =>
    state.pendingSince !== undefined && now - state.pendingSince < state.throttleMs;

  const enqueuePatch = (
    turnId: string,
    chatId: number,
    patch: string,
    now: number,
    mode: GatewayPatchMode,
  ): EnqueuePatchResult => {
    const state = getOrCreate(turnId, chatId);

    if (state.pendingPatch === patch || state.lastDispatchedPatch === patch) {
      return { status: "noop", droppedPatches: state.droppedPatches };
    }

    if (state.pendingPatch !== undefined && shouldDropForThrottle(state, now)) {
      state.droppedPatches += 1;
    }

    state.pendingPatch = patch;
    state.pendingSince = now;
    state.lastPatchMode = mode;

    return { status: "queued", droppedPatches: state.droppedPatches };
  };

  const applyEvent = (params: {
    turnId: string;
    chatId: number;
    event: GatewayTurnEvent;
    now: number;
    action?: GatewayTurnAction;
    canEditPrimary?: boolean;
  }): TurnEventApplyResult => {
    const state = getOrCreate(params.turnId, params.chatId);
    const phase = nextPhaseFromEvent(params.event);
    state.phase = phase;

    const mode = resolvePatchMode(params.canEditPrimary ?? true);
    const patch = buildGatewayTurnPatchText({
      phase,
      event: params.event,
      action: params.action,
      mode,
    });
    const enqueueResult = enqueuePatch(params.turnId, params.chatId, patch, params.now, mode);

    return {
      turnId: params.turnId,
      phase,
      mode,
      patch,
      enqueueStatus: enqueueResult.status,
      droppedPatches: enqueueResult.droppedPatches,
    };
  };

  const forcePatch = (turnId: string): void => {
    const state = store.get(turnId);
    if (state === undefined || state.pendingPatch === undefined) {
      return;
    }

    const now = Date.now();
    state.lastDispatchedPatch = state.pendingPatch;
    state.lastDispatchedAt = now;
    state.pendingPatch = undefined;
    state.pendingSince = undefined;
  };

  const setMessageId = (turnId: string, chatId: number, messageId: number): void => {
    const state = getOrCreate(turnId, chatId);
    state.messageId = messageId;
  };

  const isDue = (turnId: string, now: number): boolean => {
    const state = store.get(turnId);
    if (state?.pendingPatch === undefined || state.pendingSince === undefined) {
      return false;
    }
    return now - state.pendingSince >= state.throttleMs;
  };

  const drainDue = (now: number): ReadonlyArray<PatchQueueEntry> => {
    const due: Array<PatchQueueEntry> = [];
    for (const state of store.values()) {
      if (!isDue(state.turnId, now) || state.pendingPatch === undefined) {
        continue;
      }
      due.push({
        turnId: state.turnId,
        patch: state.pendingPatch,
        chatId: state.chatId,
        mode: state.lastPatchMode ?? "edit_primary",
      });
      state.lastDispatchedPatch = state.pendingPatch;
      state.lastDispatchedAt = now;
      state.pendingPatch = undefined;
      state.pendingSince = undefined;
    }
    return due;
  };

  const getTurn = (turnId: string): TelegramTurnState | undefined => {
    const state = store.get(turnId);
    if (state === undefined) {
      return undefined;
    }
    return makeTurnSnapshot(state);
  };

  const getTurns = (): ReadonlyArray<TelegramTurnState> =>
    Array.from(store.values(), makeTurnSnapshot);

  return {
    enqueuePatch,
    applyEvent,
    forcePatch,
    setMessageId,
    drainDue,
    getTurn,
    getTurns,
    isDue,
  };
};
