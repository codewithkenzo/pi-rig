# Pi Dispatch

[![npm](https://img.shields.io/npm/v/@codewithkenzo/pi-dispatch?color=3B82F6&style=flat-square)](https://www.npmjs.com/package/@codewithkenzo/pi-dispatch)
[![Bun](https://img.shields.io/badge/Bun-%23000?style=flat-square&logo=bun&logoColor=white)](https://bun.sh)
[![Effect](https://img.shields.io/badge/Effect--TS-black?style=flat-square)](https://effect.website)
[![TypeScript](https://img.shields.io/badge/TypeScript-%23007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)

`@codewithkenzo/pi-dispatch` — Profile-based execution and queued task dispatch for the [Pi coding agent](https://github.com/badlogic/pi-mono).

Part of the [Pi Rig suite](https://github.com/codewithkenzo/pi-rig).

Pi Dispatch registers execution primitives that let the agent launch tasks with named profiles, manage background jobs, and inject skills into subagent runs — without writing boilerplate for each new task type.

## Quick demo

- [Watch the Pi Dispatch demo (MP4)](../../docs/media/demos/pi-dispatch-demo.mp4) — shows the flow deck, profile routing, and a background run in one short capture.

## Surfaces

| Type | Name | Purpose |
|------|------|---------|
| Tool | `flow_run` | Run a single task with a named profile (foreground or background) |
| Tool | `flow_batch` | Run multiple tasks sequentially or in parallel |
| Command | `/flow status` | List active and completed jobs |
| Command | `/flow cancel <id>` | Cancel a queued or running job |
| Command | `/flow profiles` | List available profiles and their settings |

## Profiles

Built-in profiles control reasoning level, iteration cap, and toolsets:

| Profile | Reasoning | Iterations | Toolsets |
|---------|-----------|------------|----------|
| explore | low | 11 | terminal, file |
| research | medium | 18 | terminal, file, web |
| coder | medium | 35 | code_execution |
| debug | high | 20 | inherits |
| browser | medium | 25 | browser |
| ambivalent | medium | 18 | inherits |

Custom profiles are loaded from JSON:

- `~/.pi/agent/flow-profiles.json` — global overrides
- `<cwd>/.pi/flow-profiles.json` — project-local (wins ties)

## Architecture

```
index.ts              Extension entry — wires queue, tools, commands, session events
src/
  types.ts            TypeBox schemas + tagged errors
  queue.ts            In-memory job queue (Effect Ref)
  profiles.ts         Built-in profiles + file-based overrides
  executor.ts         Subprocess runner (Effect.callback + acquireUseRelease)
  vfs.ts              Skill file staging with temp file lifecycle
  tool.ts             flow_run tool
  batch-tool.ts       flow_batch tool
  commands.ts         /flow command handler
  deck/
    index.ts          showFlowDeck() — 3-zone TUI overlay factory
    state.ts          DeckState + feed dedup and sanitization
    header.ts         Zone 1 — title, badge, clock
    columns.ts        Zone 2 — profile panel and activity feed
    summary.ts        Zone 3 — scrollable subprocess output
    footer.ts         Zone 4 — keybind pills with key-flash feedback
    layout.ts         ANSI-preserving column fit utilities
    icons.ts          Nerd Font icons with ASCII fallback (PI_ASCII_ICONS=1)
```

## Key patterns

- **Effect at boundaries** — async subprocess and tool execution stay in Effect-TS. Conversion to Promise happens only at the pi API surface via `Effect.runPromise` and `Effect.runPromiseExit`.
- **Tagged errors** — `ProfileNotFoundError`, `SkillLoadError`, `SubprocessError`, `JobNotFoundError`. No trailing `()` per Bun 1.3+ convention.
- **acquireUseRelease** — skill temp files are always cleaned up, even on subprocess failure or interruption.
- **Session persistence** — queue state is snapshotted on `agent_end` and restored on `session_start`.
- **Deck TUI** — `AnimationTicker` drives 4–8 fps render. `withMotion()` guards every animation primitive. `fitAnsiColumn(text, width)` handles ANSI-preserving column fit.

## Install

```bash
pi install npm:@codewithkenzo/pi-dispatch
```

Or install all Pi Rig extensions at once:

```bash
bunx @codewithkenzo/pi-rig@latest
```

<details>
<summary>From source</summary>

```bash
bun run setup
# or individually:
pi install ./extensions/flow-system
```

</details>

## Prerequisites

- [Bun](https://bun.sh) >= 1.3
- [Pi coding agent](https://github.com/badlogic/pi-mono) installed and on your PATH

## Development

```bash
cd extensions/flow-system
bun install
bun run build       # runtime bundle for the Pi coding agent
bun run typecheck   # typecheck
bun test            # tests
```

## Links

- [Pi Rig suite](https://github.com/codewithkenzo/pi-rig) — monorepo with all extensions, installer, and docs
- [Pi coding agent](https://github.com/badlogic/pi-mono) — upstream runtime
- [npm: @codewithkenzo/pi-dispatch](https://www.npmjs.com/package/@codewithkenzo/pi-dispatch)
- Related: [@codewithkenzo/pi-theme-switcher](https://github.com/codewithkenzo/pi-theme-switcher), [@codewithkenzo/pi-gateway-messaging](https://github.com/codewithkenzo/pi-rig/tree/main/extensions/gateway-messaging), [@codewithkenzo/pi-notify-cron](https://github.com/codewithkenzo/pi-rig/tree/main/extensions/notify-cron)
