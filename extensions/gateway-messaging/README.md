# gateway-messaging

## Sprint-start scaffold

This is a **sprint-start scaffold only** for Telegram-first gateway behavior. It intentionally implements the minimal control-plane pieces so downstream work can layer on transport and state persistence safely.

Telegram-first baseline gateway-messaging extension for pi.

## What it does

- Registers one tool: `gateway_turn_preview`
- Registers command: `/gateway status`
- Tracks per-turn Telegram lifecycle state (`turnId`, `chatId`, phase, optional `messageId`)
- Provides a single-message patch queue per turn with throttle interval + no-op skip
  - superseded patches are dropped inside the throttle window
  - last write always wins
- Validates versioned inline action payloads (`GatewayTurnAction`) and provides parse/format helpers
- Supports ticket action kinds: `retry`, `details`, `approve`, `cancel`
- Coalesces tool-stream events into compact text with `formatToolStreamRollup`
- Applies patch-mode policy (`edit_primary` vs `fallback_auxiliary`)

## Scope and limitations (current baseline)

This baseline is **Telegram-first** and intentionally narrow:

- queueing/dispatch/formatting only (no Telegram transport client wiring in this slice)
- no message edit/delete API calls yet
- no Discord/WhatsApp/other-provider adapters yet
- no persistent storage (all state is in-memory)

## Not yet covered in this sprint

- Telegram send/edit transport wiring (`sendMessage`, `editMessageText`, media fallback)
- Error/permission retry policy (backoff + dead-letter)
- Durable turn state persistence and recovery across agent restarts
- Multi-channel action handling outside Telegram
- Any additional action kinds not in the ticket contract (`retry`, `details`, `approve`, `cancel`). Add only with explicit docs and tests before extending.

## Development

```bash
cd extensions/gateway-messaging
bun install
bun run build
bun run typecheck
bun test
```
