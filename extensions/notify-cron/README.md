# Notify Cron

Scheduled notifications with typed destinations and lease-aware ticking for the Pi coding agent.

Notify Cron registers jobs with explicit destination IDs, ticks them on a lease-aware schedule, coalesces misfires to avoid burst delivery, and carries execution envelopes for downstream work.

## Surfaces

| Type | Name | Purpose |
|------|------|---------|
| Tool | `notify_cron_upsert` | Register or update a scheduled job |
| Tool | `notify_cron_tick` | Tick due jobs (lease-aware) |
| Tool | `notify_cron_list` | List registered jobs and their next-fire times |
| Tool | `notify_cron_remove` | Remove a scheduled job by ID |
| Command | `/notify-cron status` | Show registered jobs and scheduler state |
| Command | `/notify-cron tick` | Manually trigger a tick |

## Architecture

```
index.ts              Extension entry — registers tools, commands
src/
  types.ts            TypeBox schemas + tagged errors
  scheduler.ts        Job store, tick logic, misfire coalescing
  validation.ts       Destination string and envelope validation
  tool.ts             Tool implementations
  commands.ts         /notify-cron command handler
skills/
  notify-cron/
    SKILL.md          Bundled skill for agent context
    references/
      job-examples.md Destination and envelope examples
```

## Destination format

Jobs require explicit destination IDs:

```
telegram:<chat_id>
telegram:<chat_id>:<thread_id>
discord:<channel_id>
```

## Execution envelope

Each job can carry an envelope with:

- `model` — model ID to use for the triggered run
- `reasoning` — reasoning level (low / medium / high)
- `maxIterations` — iteration cap
- `preload` — preload context string
- `skills` — list of skill names to inject
- `toolsets` — toolset restrictions
- `permissions` — permission overrides

## Lease-aware ticking

`notify_cron_tick` acquires a short lease before processing due jobs, so concurrent ticks from multiple callers do not double-fire the same slot.

Misfire coalescing: if a job misses multiple fire windows, only one delivery is triggered on the next tick. No backlog burst.

## Feature flags

### Auth policy

```bash
PI_NOTIFY_CRON_ALLOWED_ACTOR_IDS=u1,u2
PI_NOTIFY_CRON_ACCESS_TOKEN=<shared-token>
```

When set, calls to `notify_cron_upsert`, `notify_cron_tick`, and `notify_cron_remove` require a matching actor ID and/or token. When unset, the extension runs in open/dev mode.

## Install

### From the Pi Rig suite

```bash
bun run setup
```

or individually:

```bash
pi install ./extensions/notify-cron
```

## Development

```bash
cd extensions/notify-cron
bun install
bun run build       # runtime bundle for the Pi coding agent
bun run typecheck   # typecheck
bun test            # tests
```
