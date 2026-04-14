import type { TelegramIngressEvent, TelegramIngressResult } from "./types.js";

export interface TelegramUpdateShape {
  readonly update_id?: number;
  readonly message?: {
    readonly chat?: { readonly id?: number | string };
    readonly message_thread_id?: number | string;
    readonly text?: string;
  };
  readonly edited_message?: {
    readonly chat?: { readonly id?: number | string };
    readonly message_thread_id?: number | string;
    readonly text?: string;
  };
  readonly callback_query?: {
    readonly data?: string;
    readonly message?: {
      readonly chat?: { readonly id?: number | string };
      readonly message_thread_id?: number | string;
    };
  };
}

export interface TelegramIngressDedupe {
  seen(key: string): boolean;
  remember(key: string): void;
}

class MemoryDedupe implements TelegramIngressDedupe {
  private readonly order: string[] = [];
  private readonly set = new Set<string>();

  constructor(private readonly maxSize = 10000) {}

  seen(key: string): boolean {
    return this.set.has(key);
  }

  remember(key: string): void {
    if (this.set.has(key)) return;
    this.set.add(key);
    this.order.push(key);
    while (this.order.length > this.maxSize) {
      const oldest = this.order.shift();
      if (oldest !== undefined) this.set.delete(oldest);
    }
  }
}

export const makeTelegramIngressDedupe = (maxSize = 10000): TelegramIngressDedupe =>
  new MemoryDedupe(maxSize);

const toOptString = (value: number | string | undefined): string | undefined => {
  if (value === undefined) return undefined;
  const next = String(value).trim();
  return next.length > 0 ? next : undefined;
};

const pickChatId = (update: TelegramUpdateShape): string | undefined =>
  toOptString(update.message?.chat?.id) ??
  toOptString(update.edited_message?.chat?.id) ??
  toOptString(update.callback_query?.message?.chat?.id);

const pickThreadId = (update: TelegramUpdateShape): string | undefined =>
  toOptString(update.message?.message_thread_id) ??
  toOptString(update.edited_message?.message_thread_id) ??
  toOptString(update.callback_query?.message?.message_thread_id);

const pickText = (update: TelegramUpdateShape): string | undefined => {
  const text = update.message?.text ?? update.edited_message?.text ?? update.callback_query?.data;
  if (text === undefined) return undefined;
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const makeTelegramIdempotencyKey = (bot: string, updateId: number): string =>
  `tg:${bot}:${updateId}`;

export const normalizeTelegramIngressUpdate = (
  bot: string,
  mode: "webhook" | "polling",
  update: TelegramUpdateShape,
  dedupe: TelegramIngressDedupe,
  receivedAt = Date.now(),
): TelegramIngressResult => {
  if (typeof update.update_id !== "number" || !Number.isFinite(update.update_id)) {
    return { ok: false, reason: "invalid_update" };
  }

  const idempotencyKey = makeTelegramIdempotencyKey(bot, update.update_id);
  if (dedupe.seen(idempotencyKey)) {
    return { ok: true, duplicate: true };
  }

  dedupe.remember(idempotencyKey);
  const chatId = pickChatId(update);
  const threadId = pickThreadId(update);
  const text = pickText(update);
  const event: TelegramIngressEvent = {
    platform: "telegram",
    mode,
    bot,
    updateId: update.update_id,
    idempotencyKey,
    receivedAt,
    payload: update,
    ...(chatId === undefined ? {} : { chatId }),
    ...(threadId === undefined ? {} : { threadId }),
    ...(text === undefined ? {} : { text }),
  };

  return { ok: true, duplicate: false, event };
};

export const normalizeTelegramPollingBatch = (
  bot: string,
  updates: readonly TelegramUpdateShape[],
  dedupe: TelegramIngressDedupe,
  receivedAt = Date.now(),
): { events: TelegramIngressEvent[]; duplicateCount: number; invalidCount: number } => {
  const events: TelegramIngressEvent[] = [];
  let duplicateCount = 0;
  let invalidCount = 0;

  for (const update of updates) {
    const normalized = normalizeTelegramIngressUpdate(bot, "polling", update, dedupe, receivedAt);
    if (!normalized.ok) {
      invalidCount += 1;
      continue;
    }
    if (normalized.duplicate) {
      duplicateCount += 1;
      continue;
    }
    if (normalized.event !== undefined) events.push(normalized.event);
  }

  return { events, duplicateCount, invalidCount };
};
