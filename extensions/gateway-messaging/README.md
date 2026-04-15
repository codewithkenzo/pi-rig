# Gateway Messaging

## Current baseline

This is a **sprint-start scaffold only** for Telegram-first gateway behavior. It intentionally implements the minimal control-plane pieces so downstream work can layer on transport and state persistence safely.

Telegram-first baseline messaging extension for the Pi coding agent.

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

- queueing/dispatch/formatting with Telegram send/edit adapter support
- primary-message strategy: send once, edit in place, replace when edit is rejected
- no Discordeno transport integration yet (adapter is pure + diagnostics-only in this slice)
- no persistent storage (all state is in-memory)

### HS-025: Discordeno adapter baseline (no live transport)

- adds Discord destination parsing contract for `discord:<channel_or_thread_id>`
- supports optional `discord:<channel_id>:<thread_id>` normalization into runtime shape:
  - `{ platform: "discord", kind: "channel" | "thread", id, threadId? }`
- exposes moderation action policy enforcement (pure function) that requires:
  - role gate
  - permission gate
  - non-empty audit reason for moderation actions
- command diagnostics:
  - `/gateway discord normalize <target>`
  - `/gateway discord moderation <action> <role> <perm1,perm2> <audit_reason>`

## Not yet covered in this sprint

- Telegram send/edit transport wiring (`sendMessage`, `editMessageText`, media fallback)
- Error/permission retry policy (backoff + dead-letter)
- Durable turn state persistence and recovery across agent restarts
- Multi-channel action handling outside Telegram
- Any additional action kinds not in the ticket contract (`retry`, `details`, `approve`, `cancel`). Add only with explicit docs and tests before extending.

## Optional operator auth policy

For callback/action hardening in local deployments:

- `PI_GATEWAY_ALLOWED_ACTOR_IDS=u1,u2`
- `PI_GATEWAY_ACCESS_TOKEN=<shared-token>`

Policy behavior:
- if unset -> open/dev mode
- if set -> action execution requires allowed actor and/or matching token

## Optional Deepgram hooks (feature flags)

`gateway_turn_preview` supports voice hooks behind flags:

- `PI_GATEWAY_DEEPGRAM_STT_ENABLED=true` enables transcript summary injection (`voice_transcript`).
- `PI_GATEWAY_DEEPGRAM_TTS_ENABLED=true` enables final-response TTS queue signal (`request_tts` + `final_text`).

## Development

```bash
cd extensions/gateway-messaging
bun install
bun run build
bun run typecheck
bun test
```
