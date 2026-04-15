# Notify Cron

Notify Cron is a Pi coding agent extension for destination-safe scheduled notifications.

## Features

- explicit destination ids (`telegram:<chat>[:thread]`, `discord:<channel>`)
- lease-aware ticking
- idempotency keys per scheduled slot
- misfire coalescing (no backlog burst)
- envelope-aware job config (model/reasoning/maxIterations/preload/skills/toolsets/permissions)

## Tools

- `notify_cron_upsert`
- `notify_cron_tick`
- `notify_cron_list`
- `notify_cron_remove`

## Command

- `/notify-cron status`
- `/notify-cron tick`

## Optional operator auth policy

For local-first hardening (without introducing full session auth):

- `PI_NOTIFY_CRON_ALLOWED_ACTOR_IDS=u1,u2`
- `PI_NOTIFY_CRON_ACCESS_TOKEN=<shared-token>`

When policy is set, tool calls to `notify_cron_upsert`, `notify_cron_tick`, and `notify_cron_remove`
require a matching actor/token context.

## Development

```bash
cd extensions/notify-cron
bun install
bun run build
bun run typecheck
bun test
```
