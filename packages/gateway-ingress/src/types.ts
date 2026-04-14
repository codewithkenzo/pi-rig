export interface TelegramIngressEvent {
  readonly platform: "telegram";
  readonly mode: "webhook" | "polling";
  readonly bot: string;
  readonly updateId: number;
  readonly idempotencyKey: string;
  readonly chatId?: string;
  readonly threadId?: string;
  readonly text?: string;
  readonly receivedAt: number;
  readonly payload: unknown;
}

export interface TelegramIngressReject {
  readonly ok: false;
  readonly reason: "invalid_secret" | "unknown_bot" | "invalid_update";
}

export interface TelegramIngressAccept {
  readonly ok: true;
  readonly duplicate: boolean;
  readonly event?: TelegramIngressEvent;
}

export type TelegramIngressResult = TelegramIngressReject | TelegramIngressAccept;

