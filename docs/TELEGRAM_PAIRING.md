# Telegram pairing guide (consumer path)

This guide is for getting a real Telegram bot paired quickly so you can verify the extension surfaces in pi.

## What is shipped today

- `gateway-messaging` is a Telegram-first runtime baseline (queue/action/diagnostics)
- `gateway-ingress` is a Hono ingress contract package for webhook + polling normalization
- slash command surface: `/gateway status`

If you need full production bot behavior, treat this as the pairing + ingress baseline and extend from here.

## 1) Install extensions and restart pi

From repo root:

```bash
bun run setup
```

Verify:

```bash
pi list
```

Expected extension paths:

- `.../extensions/flow-system`
- `.../extensions/theme-switcher`
- `.../extensions/gateway-messaging`
- `.../extensions/notify-cron`

Then open a **fresh** pi session and run:

```text
/gateway status
```

## 2) Create a Telegram bot token + webhook secret

In BotFather:

- create token (example env name: `TELEGRAM_BOT_TOKEN`)
- choose a webhook secret token (example env name: `TELEGRAM_WEBHOOK_SECRET`)

## 3) Pick mode: polling (local) vs webhook (hosted)

### A) Polling mode (recommended for local)

Use polling while developing locally (no public HTTPS endpoint needed).

`gateway-ingress` normalization helper for polling batches:

- `normalizeTelegramPollingBatch(bot, updates, dedupe)`

You can feed updates from your polling process, then forward normalized events to your runtime.

### B) Webhook mode (recommended for hosted)

Use Hono ingress endpoint:

- `POST /telegram/webhook/:bot`

Required header:

- `X-Telegram-Bot-Api-Secret-Token: <secret>`

The ingress contract returns:

- `{ ok: true, duplicate: false, idempotencyKey }` for first-seen updates
- `{ ok: true, duplicate: true }` for duplicate updates
- `401 { ok: false, reason: "invalid_secret" }` when secret mismatch

## 4) Minimal webhook host example (Hono)

```ts
import { createGatewayIngressApp } from "@codewithkenzo/gateway-ingress";

const app = createGatewayIngressApp({
  telegram: {
    webhookSecrets: {
      primary: process.env.TELEGRAM_WEBHOOK_SECRET ?? "",
    },
  },
  onTelegramEvent: async (event) => {
    console.log("telegram event", event.idempotencyKey, event.chatId, event.text);
  },
});

export default app;
```

## 5) Quick slash-command checks in pi

Once paired and installed:

```text
/gateway status
/flow profiles
/theme list
```

If `/theme` or `/flow` is missing, run:

```bash
pi install ./extensions/theme-switcher
pi install ./extensions/flow-system
```

Then restart pi.

## 6) Troubleshooting checklist

- `pi list` does not include extension path -> install it explicitly with `pi install ...`
- commands still missing after install -> restart pi session
- command exists but no Telegram events -> verify token/secret and mode (polling vs webhook)
- webhook 401 -> wrong `X-Telegram-Bot-Api-Secret-Token`
- duplicate events unexpectedly -> check idempotency key source (`tg:<bot>:<update_id>`)

