# Gateway Messaging

Telegram-first turn updates and action routing for the Pi coding agent.

Gateway Messaging formats agent turn output for remote delivery, maintains per-turn lifecycle state, and supports structured action payloads for downstream handling. It uses a patch-queue model so a single Telegram message stays updated throughout a turn rather than flooding the chat.

## Surfaces

| Type | Name | Purpose |
|------|------|---------|
| Tool | `gateway_turn_preview` | Preview or dispatch a turn update with optional action payload |
| Command | `/gateway status` | Show gateway state and current turn info |
| Command | `/gateway discord normalize <target>` | Normalize a Discord destination string |
| Command | `/gateway discord moderation <action> <role> <perms> <reason>` | Validate a moderation action policy |

## Architecture

```
index.ts              Extension entry — registers tool, commands, turn state
src/
  types.ts            TypeBox schemas + tagged errors
  turn-state.ts       Per-turn lifecycle state (turnId, chatId, phase, messageId)
  dispatcher.ts       Patch queue with throttle interval and no-op skip
  actions.ts          GatewayTurnAction parse and format helpers
  rollup.ts           Tool-stream event coalescing into compact text
  text-policy.ts      Patch-mode policy (edit_primary vs fallback_auxiliary)
  telegram-adapter.ts Telegram send/edit adapter surface
  discord-adapter.ts  Discord destination parsing and moderation policy (pure)
  deepgram.ts         STT/TTS voice hooks (feature-flag gated)
  tool.ts             gateway_turn_preview implementation
  commands.ts         /gateway command handler
skills/
  gateway-messaging/
    SKILL.md          Bundled skill for agent context
    references/
      turn-flow.md    Turn lifecycle reference
```

## Patch queue model

Each turn gets a single-message patch queue:

- patches superseded inside the throttle window are dropped
- last write always wins within the window
- patch-mode policy decides whether to edit the primary message or fall back to auxiliary

## Action payloads

Supports versioned inline action payloads (`GatewayTurnAction`) with kinds: `retry`, `details`, `approve`, `cancel`.

## Feature flags

### Auth policy

```bash
PI_GATEWAY_ALLOWED_ACTOR_IDS=u1,u2
PI_GATEWAY_ACCESS_TOKEN=<shared-token>
```

When set, action execution requires a matching actor ID and/or token. When unset, the extension runs in open/dev mode.

### Voice hooks (Deepgram)

```bash
PI_GATEWAY_DEEPGRAM_STT_ENABLED=true   # transcript summary injection (voice_transcript)
PI_GATEWAY_DEEPGRAM_TTS_ENABLED=true   # TTS queue signal on final response (request_tts + final_text)
```

## Install

### From the Pi Rig suite

```bash
bun run setup
```

or individually:

```bash
pi install ./extensions/gateway-messaging
```

## Development

```bash
cd extensions/gateway-messaging
bun install
bun run build       # runtime bundle for the Pi coding agent
bun run typecheck   # typecheck
bun test            # tests
```
