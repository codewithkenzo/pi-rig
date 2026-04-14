# Install

## Consumer quick path

From repo root:

```bash
bun run setup
```

Then restart pi and verify:

```bash
pi list
```

You should see these extension paths:

- `.../extensions/flow-system`
- `.../extensions/theme-switcher`
- `.../extensions/gateway-messaging`
- `.../extensions/notify-cron`

Open pi and check:

```text
/flow profiles
/theme list
/gateway status
/notify-cron status
```

## If commands are missing

```bash
pi install ./extensions/theme-switcher
pi install ./extensions/flow-system
pi install ./extensions/gateway-messaging
pi install ./extensions/notify-cron
```

Start a fresh pi session after install.

## Telegram pairing

Use `docs/TELEGRAM_PAIRING.md` for bot pairing + ingress mode setup.

## Detailed setup behavior

`bun run setup` does:

1. installs workspace dependencies
2. typechecks `shared/`
3. discovers extension packages under `extensions/`
4. installs, typechecks, and builds each selected extension
5. copies bundled plugin skills into `~/.pi/skills/<plugin>/`
6. runs `pi install <extension-path>` for each built extension

Useful flags:

```bash
bun run setup -- --dry-run
bun run setup -- --skip-install
bun run setup -- --extensions flow-system,theme-switcher
bun run setup -- --pi-path /absolute/path/to/pi
```

## Auth and provider setup

The installer does not do provider login.

- extension install is separate from model/provider auth
- extensions reuse whatever pi already has configured
- configure provider auth with normal pi env/API-key flow (`pi --help`)

## Manual extension build/install

```bash
cd extensions/theme-switcher
bun install
bun run build
bun tsc --noEmit
bun test

# then from repo root (or absolute path):
pi install ./extensions/theme-switcher
```

## Plan relay to Telegram (Hermes)

```bash
python3 bin/notify_plan_to_tg.py --file <plan-or-ticket.md> --agent <agent-name> --status <status>
```

Watcher mode:

```bash
bun run plan:watch:seed
bun run plan:watch -- --source codex --telegram-target "telegram:<chat_id>:<thread_id>" --attach-file
```
