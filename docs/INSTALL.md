# Install

## Prerequisites

- Bun 1.3+
- pi installed separately from `badlogic/pi-mono`
- a local clone of this repo

## Workspace setup

From the repo root:

```bash
bun install
bun run build
```

Optional verification:

```bash
bun run typecheck
bun run test
```

## Install with the setup script

Recommended path:

```bash
bun run setup
```

Public package target once published:

```bash
bunx @codewithkenzo/pi-installer@latest
npx @codewithkenzo/pi-installer@latest
```

Useful flags:

```bash
bun run setup -- --dry-run
bun run setup -- --skip-install
bun run setup -- --extensions flow-system,theme-switcher
bun run setup -- --pi-path /absolute/path/to/pi
```

What the script does:

1. installs root dependencies
2. typechecks `shared/`
3. discovers extension packages under `extensions/`
4. installs, typechecks, and builds each selected extension
5. copies bundled plugin skills into `~/.pi/skills/<plugin>/`
6. attempts `pi install <extension-path>` for each successful extension

## Auth and provider setup

The installer does not perform provider login.

- extension install is separate from model/provider auth
- the extensions reuse whatever pi can already access
- if pi is missing credentials, configure them the normal pi way:
  - `--api-key`
  - provider env vars such as `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.
  - any OAuth/token path already supported by pi

Check `pi --help` for the current provider/env list on your machine.

## Manual extension install

### flow-system

```bash
cd extensions/flow-system
bun install
bun run build
bun tsc --noEmit
bun test
```

Then register it in pi:

```text
/extension install /absolute/path/to/extensions/flow-system
```

### theme-switcher

```bash
cd extensions/theme-switcher
bun install
bun run build
bun tsc --noEmit
bun test
```

`theme-switcher` is installable after the build step and includes tools + `/theme` command + lifecycle hooks.

If you want to tune its behavior, use the shared config locations:

- global: `~/.pi/agent/theme.json`
- project: `<cwd>/.pi/theme.json`
- env overrides: `PI_THEME_*` (flat keys only; nested `animation` settings are best kept in the JSON files)

The config shape is the same one used by `shared/theme/loadTheme()`: `active`, `colorMode`, `nerdFonts`, `animation`, and `custom`.

## Global Kenzo surfaces

This repo does not auto-sync dotfiles yet.

Phase 1-2 uses a spec-first house model:

- project docs live here
- shared agent skills and global guidance live in `~/.claude`, `~/.codex`, and `~/.hermes`
- the mapping rules are documented in `docs/KENZO_HOUSE_SPEC.md`

If you are updating both repo and global Kenzo surfaces, read the house spec before editing.

## Plan relay to Telegram (Hermes)

Use this when plan/ticket files are updated by delegated agents and you want Telegram visibility too.

```bash
python3 bin/notify_plan_to_tg.py --file <plan-or-ticket.md> --agent <agent-name> --status <status>
```

Examples:

```bash
bun run plan:tg -- --file .claude/plans/scalable-enchanting-rabbit.md --agent d5 --status updated
bun run plan:tg -- --file .tickets/sprints/heavy-stepper/015-harness-polish-auth-baseline.md --agent t4 --status in_progress
```

Dry run:

```bash
bun run plan:tg:dry -- --file .claude/plans/scalable-enchanting-rabbit.md
```

Env source order:

1. CLI flags (`--hook-url`, `--hook-secret`)
2. `~/.hermes/.env` values (`HERMES_HOOK_URL`, `HERMES_HOOK_SECRET`)
3. fallback URL: `http://localhost:8642/hooks/notify`
4. telegram target (for fallback/direct mode): `TELEGRAM_NOTIFY_TARGET` or `FACTORY_NOTIFY_TARGET`

If Hermes `/hooks/notify` is unavailable, force Telegram transport:

```bash
bun run plan:tg -- --file .claude/plans/scalable-enchanting-rabbit.md --agent k9 --status reviewed --transport telegram
```

`--transport auto` (default) tries hook first, then Telegram fallback.

Optional flags:

```bash
# include markdown as Telegram document
bun run plan:tg -- --file .claude/plans/scalable-enchanting-rabbit.md --attach-file
# mission-control attribution source
bun run plan:tg -- --file .claude/plans/scalable-enchanting-rabbit.md --source codex
```



### Auto-watch mode (recommended)

```bash
bun run plan:watch:seed
bun run plan:watch -- --source codex --telegram-target "telegram:<chat_id>:<thread_id>" --attach-file
```

Run in tmux for long-lived relay:

```bash
tmux new -d -s plan-relay 'cd ~/dev/pi-plugins-repo-kenzo && bun run plan:watch'
# or
./bin/plan_relay_tmux.sh
# or configure env
PLAN_RELAY_TELEGRAM_TARGET="telegram:<chat_id>:<thread_id>" ./bin/plan_relay_tmux.sh
```

One-shot scan (useful for CI/local checks):

```bash
bun run plan:watch:once
```
