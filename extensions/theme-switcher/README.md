# Theme Switcher

`@codewithkenzo/pi-theme-switcher` — Runtime theme selection and preview for the [Pi coding agent](https://github.com/badlogic/pi-mono).

Part of the [Pi Rig suite](https://github.com/codewithkenzo/pi-rig).

Theme Switcher lets the agent switch, preview, and cycle themes during a live session. It persists the active theme across restarts and injects current-theme context into each session.

## Surfaces

| Type | Name | Purpose |
|------|------|---------|
| Tool | `theme_set` | Set the active theme by name |
| Tool | `theme_list` | List available themes |
| Tool | `theme_preview` | Preview a theme without committing |
| Command | `/theme status` | Show the current active theme |
| Command | `/theme set <name>` | Set the active theme |
| Command | `/theme list` | List available themes |
| Command | `/theme preview <name>` | Preview a theme |
| Command | `/theme cycle` | Cycle to the next theme |

## Architecture

```
index.ts              Extension entry — registers tools, commands, session hooks
src/
  types.ts            TypeBox schemas + tagged errors
  state.ts            Active theme state (in-memory)
  runtime.ts          Theme application and validation
  tools.ts            theme_set, theme_list, theme_preview
  commands.ts         /theme command handler
  picker.ts           Interactive theme picker
  lifecycle.ts        Session restore and agent-end persistence
  session.ts          Theme context injection into session entries
  renderers.ts        Theme preview rendering
  ui.ts               TUI helpers
skills/
  theme-switcher/
    SKILL.md          Bundled skill for agent context
```

## Key patterns

- **Session persistence** — active theme is saved on `agent_end` and restored on `session_start`.
- **Context injection** — current theme is injected into the session so the agent is always aware of the active state.
- **Effect at boundaries** — async operations use Effect-TS. All exits to the pi API surface use `Effect.runPromise`.

## Install

### From the Pi Rig suite

```bash
bun run setup
```

or individually:

```bash
pi install ./extensions/theme-switcher
```

### Direct (wave 1)

```bash
bunx @codewithkenzo/pi-theme-switcher@latest
# or
npx @codewithkenzo/pi-theme-switcher@latest
```

## Prerequisites

- [Bun](https://bun.sh) >= 1.3
- [Pi coding agent](https://github.com/badlogic/pi-mono) installed and on your PATH

## Development

```bash
cd extensions/theme-switcher
bun install
bun run build       # runtime bundle for the Pi coding agent
bun run typecheck   # typecheck
bun test            # tests
```

## Links

- [Pi Rig suite](https://github.com/codewithkenzo/pi-rig) — monorepo with all extensions, installer, and docs
- [Pi coding agent](https://github.com/badlogic/pi-mono) — upstream runtime
- [npm: @codewithkenzo/pi-theme-switcher](https://www.npmjs.com/package/@codewithkenzo/pi-theme-switcher)
- Related: [@codewithkenzo/pi-dispatch](https://github.com/codewithkenzo/pi-dispatch), [@codewithkenzo/pi-gateway-messaging](https://github.com/codewithkenzo/pi-rig/tree/main/extensions/gateway-messaging), [@codewithkenzo/pi-notify-cron](https://github.com/codewithkenzo/pi-rig/tree/main/extensions/notify-cron)
