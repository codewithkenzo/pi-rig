# @codewithkenzo/pi-plugins

Consumer-first extension suite for `pi`.

If you want usable slash commands, theme switching, and Telegram/notification groundwork without hand-wiring every package, this repo is the install source.

## What you get

- `/flow` job orchestration (`flow_run`, `flow_batch`)
- `/theme` runtime theme control (`theme_set`, `theme_list`, `theme_preview`)
- `/gateway` diagnostics + Telegram-first turn/runtime baseline
- `/notify-cron` scheduled notification baseline
- bundled operator skills copied to `~/.pi/skills/*`

## Install (local repo)

```bash
bun run setup
```

That will:
1. build extensions
2. copy bundled skills
3. register extensions with `pi install ...`

Then **restart pi** (new session) so new slash commands are loaded.

## 60-second verification

```bash
pi list
```

You should see:
- `.../extensions/flow-system`
- `.../extensions/theme-switcher`
- `.../extensions/gateway-messaging`
- `.../extensions/notify-cron`

Open pi and run:

```text
/flow profiles
/theme list
/gateway status
/notify-cron status
```

## If slash commands are missing

Usually one of these:

1. extension is not installed in `pi list`
2. pi session was opened before install (restart pi)
3. cwd-specific project settings differ from user settings

Fast fix:

```bash
pi install ./extensions/theme-switcher
pi install ./extensions/flow-system
pi install ./extensions/gateway-messaging
pi install ./extensions/notify-cron
```

Then start a fresh `pi` session and retry `/theme list`.

## Telegram pairing guide

For the practical operator path (pair bot, choose polling vs webhook, verify ingress + commands), use:

- `docs/TELEGRAM_PAIRING.md`

## Status (April 14, 2026)

Implemented and usable now:
- `flow-system`
- `theme-switcher`
- `gateway-messaging` baseline
- `notify-cron` baseline
- `gateway-ingress` package (`packages/gateway-ingress`) for Hono webhook/polling normalization contracts

Roadmap/master plan:
- `.claude/plans/scalable-enchanting-rabbit.md`

Active sprint execution:
- `.tickets/sprints/heavy-stepper/`

## Installer package target

Planned public entrypoint:

```bash
bunx @codewithkenzo/pi-installer@latest
```

Until publish, use this repo + `bun run setup`.
