# Usage

## Quick verification

After installation, open a fresh Pi coding agent session and run:

```text
/flow profiles
/theme list
/gateway status
/notify-cron status
```

If a command is missing, check the [install guide](./INSTALL.md).

## Available surfaces

### Pi Dispatch

Current source path: `extensions/flow-system`

Tools:

- `flow_run`
- `flow_batch`

Command:

- `/flow status | cancel <id> | profiles`

### Theme Switcher

Current source path: `extensions/theme-switcher`

Tools:

- `theme_set`
- `theme_list`
- `theme_preview`

Command:

- `/theme status|set|list|preview|cycle`

### Gateway Messaging

Current source path: `extensions/gateway-messaging`

Tool:

- `gateway_turn_preview`

Command:

- `/gateway status`

Discord diagnostics currently included:

- `/gateway discord normalize <target>`
- `/gateway discord moderation <action> <role> <perm1,perm2> <audit_reason>`

### Notify Cron

Current source path: `extensions/notify-cron`

Tools:

- `notify_cron_upsert`
- `notify_cron_tick`
- `notify_cron_list`
- `notify_cron_remove`

Command:

- `/notify-cron status | tick`

## Current package scope

### Pi Dispatch

Current role:

- launch tasks with named profiles
- run jobs in foreground or background
- manage queued work through Pi surfaces

### Gateway Messaging

Current role:

- format turn updates for remote delivery
- keep one turn readable through a patch-oriented update model
- carry structured action payloads and compact tool-stream summaries

### Notify Cron

Current role:

- register scheduled jobs with explicit destinations
- tick jobs in a lease-aware way
- carry structured execution envelopes for downstream work

### Theme Switcher

Current role:

- control the active theme at runtime
- preview or cycle themes during a live Pi coding agent session

## Telegram workflows

For bot setup and ingress guidance, see the [Telegram pairing guide](./TELEGRAM_PAIRING.md).
