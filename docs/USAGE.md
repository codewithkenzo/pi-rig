# Usage

## Quick verification in pi

After `bun run setup`, open a fresh pi session and run:

```text
/flow profiles
/theme list
/gateway status
/notify-cron status
```

If a command is missing, see `docs/INSTALL.md` troubleshooting section.

## Extension surfaces available now

### flow-system

- tools: `flow_run`, `flow_batch`
- command: `/flow status | cancel <id> | profiles`

### theme-switcher

- tools: `theme_set`, `theme_list`, `theme_preview`
- command: `/theme status|set|list|preview|cycle`

### gateway-messaging

- tool: `gateway_turn_preview`
- command: `/gateway status`
- plus Discord diagnostics:
  - `/gateway discord normalize <target>`
  - `/gateway discord moderation <action> <role> <perm1,perm2> <audit_reason>`

### notify-cron

- tools: `notify_cron_upsert`, `notify_cron_tick`, `notify_cron_list`, `notify_cron_remove`
- command: `/notify-cron status | tick`

## Telegram pairing

For pairing + ingress mode setup (polling vs webhook), use:

- `docs/TELEGRAM_PAIRING.md`

## Notes on current scope

- `gateway-messaging` and `notify-cron` are implemented baselines.
- `packages/gateway-ingress` provides ingress contract utilities and Hono webhook endpoint support.
- The full multi-extension roadmap remains in `.claude/plans/scalable-enchanting-rabbit.md`.

## Ticket lane

Active sprint work is tracked in `.tickets/sprints/heavy-stepper/`.
