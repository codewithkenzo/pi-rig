# @codewithkenzo/pi-plugins

TypeScript Bun extensions for pi.

This repo is the project source of truth for Kenzo's pi extension suite. It holds the extension code, project rules, planning artifacts, and the docs that explain how the repo maps to the global Kenzo agent surfaces in `~/.claude`, `~/.codex`, and `~/.hermes`.

The single master plan is `.claude/plans/scalable-enchanting-rabbit.md`. Active execution is tracked in `.tickets/`.

Publish-facing package ownership uses the `codewithkenzo` scope. Kenzo remains the voice/editorial layer.

## Current extensions

| Extension | Status | Notes |
|---|---|---|
| `flow-system` | implemented, still being refined | flow profiles, queue, skill injection, `/flow` command |
| `theme-switcher` | implemented, still being refined | `theme_set`, `theme_list`, `theme_preview`, `/theme` command, lifecycle hooks |
| `gateway-messaging` | implemented baseline | Telegram-first turn queue + action schema + `/gateway` |
| `notify-cron` | implemented baseline | destination-safe scheduler + envelope-aware cron tools + `/notify-cron` |
| `gateway-ingress` (package) | implemented baseline | Hono webhook ingress (`POST /telegram/webhook/:bot`) + polling normalization contract |

Future extensions remain tracked in `.claude/plans/scalable-enchanting-rabbit.md`; execution work moves into `.tickets/` once it starts.

## Quick start

```bash
bun install
bun run build
bun run setup
```

That installs workspace dependencies, builds the runtime extension entries, copies bundled plugin skills into `~/.pi/skills/`, and attempts to register discovered extensions into pi.

Planned public entrypoints for the installer package:

```bash
bunx @codewithkenzo/pi-installer@latest
npx @codewithkenzo/pi-installer@latest
```

If you want to install extensions manually:

```bash
cd extensions/flow-system
bun install
bun run build
bun tsc --noEmit
bun test

# In a pi session:
/extension install /absolute/path/to/extensions/flow-system
```

## Docs map

- `AGENTS.md` — project conventions and cross-agent rules
- `docs/INSTALL.md` — setup and install paths
- `docs/USAGE.md` — current repo and extension usage
- `docs/KENZO_HOUSE_SPEC.md` — project/global ownership and sync rules
- `docs/playbooks/KENZO_PUBLISHING_VOICE.md` — public writing and launch voice guidance

## Transparency

This repo is in active buildout.

- `flow-system` and `theme-switcher` now build to runtime-safe `dist/index.js` entries before pi install.
- `theme-switcher` includes tools, command, and lifecycle wiring; further UX polish and cross-extension integration continue in tickets.
- The larger multi-extension roadmap is still a roadmap. The docs in this repo now call out what is implemented, partial, or planned instead of flattening everything into one launch narrative.
- Harness surfaces should feel designed and interactive, not like raw debug dumps: use the shared theme engine and animation primitives for status, loading, and preview states, while keeping motion restrained and reduced-motion aware.

## Auth model

The extensions do not add a separate auth layer today.

- provider auth stays with pi itself
- the installer builds, copies skills, and runs `pi install`; it does not log you into providers
- use the normal pi model/provider auth path (`--api-key` or environment variables shown in `pi --help`)

That keeps the extension suite consumer story simple for now while we design a friendlier guided-auth layer later.

Current hardening added in this repo:

- `gateway-messaging` supports optional operator policy via env:
  - `PI_GATEWAY_ALLOWED_ACTOR_IDS` (comma-separated IDs)
  - `PI_GATEWAY_ACCESS_TOKEN` (static shared token)
- `notify-cron` mutating/execution tools (`upsert`, `tick`, `remove`) support:
  - `PI_NOTIFY_CRON_ALLOWED_ACTOR_IDS`
  - `PI_NOTIFY_CRON_ACCESS_TOKEN`

If no env policy is set, behavior stays local/dev-friendly (open).
BetterAuth is still **not required** for these extension paths yet.

## Plan notifications to Telegram (Hermes)

When another agent writes or updates a plan/ticket markdown file, relay it to Telegram through Hermes:

```bash
python3 bin/notify_plan_to_tg.py --file .claude/plans/scalable-enchanting-rabbit.md --agent k9 --status reviewed
```

Or use package scripts:

```bash
bun run plan:tg -- --file .tickets/sprints/heavy-stepper/015-harness-polish-auth-baseline.md --agent t4 --status in_progress
bun run plan:tg:dry -- --file .claude/plans/enchant-rabbit.md
# optional attachment
bun run plan:tg -- --file .claude/plans/enchant-rabbit.md --attach-file
```

The script uses `--transport auto` by default: it tries Hermes `/hooks/notify` first, then falls back to Telegram Bot API. Telegram fallback requires `TELEGRAM_BOT_TOKEN` and an explicit target (`TELEGRAM_NOTIFY_TARGET`, `FACTORY_NOTIFY_TARGET`, or `--telegram-target`).

To auto-relay updates while you work, seed then run the watcher (recommended in tmux):

```bash
bun run plan:watch:seed
tmux new -d -s plan-relay 'cd ~/dev/pi-plugins-repo-kenzo && bun run plan:watch'
# or
./bin/plan_relay_tmux.sh
# explicit target
./bin/plan_relay_tmux.sh plan-relay "telegram:<chat_id>:<thread_id>"
```
