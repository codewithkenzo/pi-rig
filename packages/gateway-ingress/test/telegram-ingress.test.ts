import { describe, expect, test } from "bun:test";
import { createGatewayIngressApp } from "../src/app.js";
import { makeTelegramIngressDedupe, normalizeTelegramPollingBatch } from "../src/telegram.js";
import type { TelegramIngressEvent } from "../src/types.js";

describe("gateway ingress webhook contract", () => {
  test("rejects invalid webhook secret token", async () => {
    const app = createGatewayIngressApp({
      telegram: {
        webhookSecrets: { primary: "s3cret" },
      },
    });

    const response = await app.request("/telegram/webhook/primary", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "wrong",
      },
      body: JSON.stringify({ update_id: 1 }),
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ ok: false, reason: "invalid_secret" });
  });

  test("deduplicates repeated updates and emits normalized events once", async () => {
    const events: TelegramIngressEvent[] = [];
    const app = createGatewayIngressApp({
      telegram: {
        webhookSecrets: { primary: "s3cret" },
      },
      onTelegramEvent: (event) => {
        events.push(event);
      },
    });

    const payload = {
      update_id: 42,
      message: {
        chat: { id: -1001234 },
        message_thread_id: 9,
        text: "hello",
      },
    };

    const first = await app.request("/telegram/webhook/primary", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "s3cret",
      },
      body: JSON.stringify(payload),
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      ok: true,
      duplicate: false,
      idempotencyKey: "tg:primary:42",
    });

    const second = await app.request("/telegram/webhook/primary", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "s3cret",
      },
      body: JSON.stringify(payload),
    });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      ok: true,
      duplicate: true,
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      platform: "telegram",
      mode: "webhook",
      bot: "primary",
      updateId: 42,
      idempotencyKey: "tg:primary:42",
      chatId: "-1001234",
      threadId: "9",
      text: "hello",
    });
  });
});

describe("gateway ingress polling contract", () => {
  test("normalizes polling batch and deduplicates by idempotency key", () => {
    const dedupe = makeTelegramIngressDedupe();
    const normalized = normalizeTelegramPollingBatch(
      "poller",
      [
        { update_id: 10, message: { chat: { id: 1 }, text: "a" } },
        { update_id: 10, message: { chat: { id: 1 }, text: "a" } },
        { update_id: 11, callback_query: { data: "retry", message: { chat: { id: 2 } } } },
        { message: { chat: { id: 3 }, text: "bad" } },
      ],
      dedupe,
      1234,
    );

    expect(normalized.events).toHaveLength(2);
    expect(normalized.duplicateCount).toBe(1);
    expect(normalized.invalidCount).toBe(1);
    expect(normalized.events[0]?.idempotencyKey).toBe("tg:poller:10");
    expect(normalized.events[1]?.text).toBe("retry");
  });
});

