import { Hono } from "hono";
import {
  makeTelegramIngressDedupe,
  normalizeTelegramIngressUpdate,
  type TelegramIngressDedupe,
  type TelegramUpdateShape,
} from "./telegram.js";
import type { TelegramIngressEvent } from "./types.js";

export interface GatewayIngressConfig {
  readonly telegram: {
    readonly webhookSecrets: Record<string, string>;
    readonly dedupe?: TelegramIngressDedupe;
  };
  readonly onTelegramEvent?: (event: TelegramIngressEvent) => Promise<void> | void;
}

export const createGatewayIngressApp = (config: GatewayIngressConfig): Hono => {
  const app = new Hono();
  const dedupe = config.telegram.dedupe ?? makeTelegramIngressDedupe();

  app.get("/healthz", (c) => c.json({ ok: true }));

  app.post("/telegram/webhook/:bot", async (c) => {
    const bot = c.req.param("bot");
    const expectedSecret = config.telegram.webhookSecrets[bot];
    if (expectedSecret === undefined) {
      return c.json({ ok: false, reason: "unknown_bot" }, 404);
    }

    const providedSecret = c.req.header("x-telegram-bot-api-secret-token");
    if (providedSecret !== expectedSecret) {
      return c.json({ ok: false, reason: "invalid_secret" }, 401);
    }

    let update: TelegramUpdateShape;
    try {
      update = (await c.req.json()) as TelegramUpdateShape;
    } catch {
      return c.json({ ok: false, reason: "invalid_update" }, 400);
    }

    const result = normalizeTelegramIngressUpdate(bot, "webhook", update, dedupe);
    if (!result.ok) {
      return c.json(result, 400);
    }
    if (result.duplicate) {
      return c.json({ ok: true, duplicate: true });
    }

    if (result.event !== undefined) {
      await config.onTelegramEvent?.(result.event);
    }
    return c.json({
      ok: true,
      duplicate: false,
      idempotencyKey: result.event?.idempotencyKey,
    });
  });

  return app;
};

