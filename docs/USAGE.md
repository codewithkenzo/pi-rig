# Usage

## What you can use today

### flow-system

`flow-system` is production-usable for profile-driven subagent orchestration.

Primary surfaces:

- tool: `flow_run`
- tool: `flow_batch`
- command: `/flow status | cancel <id> | profiles`

Useful checks:

```bash
cd extensions/flow-system
bun tsc --noEmit
bun test
```

Typical interactive validation:

```text
/flow profiles
/flow status
```

### theme-switcher

`theme-switcher` is implemented and wired for runtime use.

What exists:

- package scaffold
- TypeBox schemas
- state management
- Effect-based `applyTheme()`
- `theme_set`, `theme_list`, `theme_preview`
- `/theme status|set|list|preview|cycle`
- `session_start`, `agent_end`, and `context` hooks
- skill doc + resources discovery wiring
- tests for state, tools, lifecycle, and command behavior
- runtime-safe bundle entry at `dist/index.js`

### gateway ingress (Hono)

`packages/gateway-ingress` is the Telegram ingress boundary package for integration:

- webhook endpoint: `POST /telegram/webhook/:bot`
- secret check: `X-Telegram-Bot-Api-Secret-Token`
- idempotency key: `tg:<bot>:<update_id>`
- polling fallback contract: `normalizeTelegramPollingBatch(...)`

Environment guidance:

- local/dev: polling mode (no public endpoint required)
- staging/prod: webhook mode on HTTPS endpoint

## How to use the repo

### Master plan and execution

`.claude/plans/scalable-enchanting-rabbit.md` is the single master plan for the extension suite.

When work moves from planning into execution, track the active work items in `.tickets/` instead of creating parallel plan docs.

### Planning and specs

The active implementation planning surface is `.claude/plans/`.

Use it for:

- roadmap slices
- architecture notes
- review findings
- phased delivery decisions

### Configuration

Extension config is file-based and follows the shared loader convention:

1. built-in defaults
2. global `~/.pi/agent/<plugin>.json`
3. project `<cwd>/.pi/<plugin>.json`
4. environment overrides like `PI_<PLUGIN>_<KEY>` (flat keys only)
5. per-tool overrides when an extension exposes them

For the theme engine, the main config keys are `active`, `colorMode`, `nerdFonts`, `animation`, and `custom`.

### Harness UX expectations

Plugin harness surfaces should read like small product components:

- use composed panels, labels, and previews instead of plain log blocks
- keep state visible with one-line status or compact inline results
- use `shared/theme/animation.ts` primitives (`pulse`, `breathe`, `fadeIn`, `shimmer`, `spin`, `spinnerFrames`, `AnimationTicker`, `withMotion`) for loading, status, and completion feedback
- keep animation purposeful, short, and reduced-motion aware
- prefer clear, fun interaction over flashy motion
- treat the repo as an extension suite, not a vague "ecosystem"; consumer docs should stay concrete about what is shipped today

### Effect baseline

If an extension uses Effect, the baseline is `effect@4.0.0-beta.48`.

Keep Effect inside the module boundary and convert to Promise only at the pi API surface with `Effect.runPromise` or `Effect.runPromiseExit`.

### Effect patterns for pi extensions

For this repo's extension scope:

- tool handlers may use `AbortSignal` and `onUpdate` for extension-native progress
- lifecycle hooks like `session_start`, `agent_end`, `context`, and `resources_discover` are valid Effect boundaries
- use `Effect.callback` for subprocess bridges and cleanup-aware async edges
- use `Effect.result` for explicit branching at command/tool boundaries
- keep services/state as plain values; this repo does **not** use `Layer`, `Context.Tag`, or `ManagedRuntime`
- rely on pi's built-in model/tool streaming; extension `onUpdate` should supplement it, not replace it

### Runtime packaging baseline

Each shipped extension should expose a built runtime entry:

- package `main` -> `./dist/index.js`
- package `extensions` -> `["./dist/index.js"]`
- build with Bun targeting Node before `pi install`

### Bundled skill baseline

Each extension-bundled skill should live in a parent directory whose name matches the skill frontmatter name.

Examples:

- `extensions/theme-switcher/skills/theme-switcher/SKILL.md`
- `extensions/flow-system/skills/flow-system/SKILL.md`
- `extensions/gateway-messaging/skills/gateway-messaging/SKILL.md`
- `extensions/notify-cron/skills/notify-cron/SKILL.md`

Each skill bundle should include operator-facing references/examples when needed:

- `references/*.md`
- `examples/*.md`

### Project rules

`AGENTS.md` is the local source of truth for:

- stack choices
- extension conventions
- commands
- constraints for Claude, Codex, and Hermes

### Public writing

Use `docs/playbooks/KENZO_PUBLISHING_VOICE.md` for:

- launch copy
- README announcement tone
- X and LinkedIn drafts
- release-note voice

It is intentionally calmer and more transparent than the earlier draft in `.claude/plans/growth-content.md`.

### Auth baseline

- no extension-specific login flow is shipped yet
- extensions inherit pi's existing provider auth
- installer/setup docs should say this directly instead of implying one-click auth

### Plan + ticket Telegram relay

If another agent creates/updates a plan, relay it to Hermes Telegram notifications:

```bash
bun run plan:tg -- --file .claude/plans/<plan>.md --agent k9 --status ready
```

For sprint tickets:

```bash
bun run plan:tg -- --file .tickets/sprints/heavy-stepper/015-harness-polish-auth-baseline.md --agent musashi-boulder --status in_progress
```

This keeps `.claude/plans` and `.tickets` updates visible in Telegram without waiting for normal session-stop hooks.

Useful options:

```bash
# attach markdown file (on by default; disable with --no-attach-file)
bun run plan:tg -- --file .claude/plans/<plan>.md --attach-file
# set attribution source in payload
bun run plan:tg -- --file .claude/plans/<plan>.md --source codex
```



Transport notes:

- default is `--transport auto` (hook then Telegram fallback)
- force only hook: `--transport hook`
- force direct Telegram: `--transport telegram`
- Telegram fallback/direct requires `TELEGRAM_BOT_TOKEN` + `TELEGRAM_NOTIFY_TARGET` (or `FACTORY_NOTIFY_TARGET`)


### Automatic relay during agent runs

Start the watcher once per machine/session:

```bash
bun run plan:watch:seed
bun run plan:watch -- --source codex --telegram-target "telegram:<chat_id>:<thread_id>" --attach-file
```

This watches `.claude/plans/**/*.md` and `.tickets/**/*.md` and relays changes as they happen.

The watcher defaults to `--attach-file`, so Telegram receives the markdown file plus caption summary.

Quick tmux helper:

```bash
./bin/plan_relay_tmux.sh
# env-based target
PLAN_RELAY_TELEGRAM_TARGET="telegram:<chat_id>:<thread_id>" ./bin/plan_relay_tmux.sh
```

### Markdown index refresh (local, deterministic)

The extension suite includes a local markdown index used by extension docs and operators:

- generated file: `docs/PI_EXTENSION_MD_INDEX.md`

Regenerate locally with:

```bash
python3 bin/refresh_md_index.py
```

or:

```bash
bun run refresh:md-index
```

Optional custom output:

```bash
python3 bin/refresh_md_index.py --output docs/PI_EXTENSION_MD_INDEX.md
```

This command scans `.claude/plans`, `.tickets`, and `docs` relative to repo root, and writes:

- path (repo-relative)
- last-modified timestamp (UTC)
- first heading/title when available

The generation order is deterministic (`path`-sorted), so running it repeatedly yields the same output unless source markdown changes.
