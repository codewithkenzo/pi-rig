# Pi Rig

A suite of extensions for the Pi coding agent.

Pi Rig handles the execution, messaging, routing, and workflow state layers that matter most during long agent runs: queued work, remote updates, scheduled delivery, and consistent runtime context.

Pi Rig is built on [pi-mono](https://github.com/badlogic/pi-mono), the open-source Pi coding agent by Mario Zechner.

## Extensions

| Package | Source | Surfaces | Role |
|---------|--------|----------|------|
| [Pi Dispatch](https://github.com/codewithkenzo/pi-dispatch) | `extensions/flow-system` | `flow_run`, `flow_batch`, `/flow` | Profile-based execution and queued task dispatch |
| [Theme Switcher](https://github.com/codewithkenzo/pi-theme-switcher) | `extensions/theme-switcher` | `theme_set`, `theme_list`, `theme_preview`, `/theme` | Runtime theme selection and session-aware restore |
| Gateway Messaging | `extensions/gateway-messaging` | `gateway_turn_preview`, `/gateway` | Telegram-first turn updates with patch queues and action payloads (source preview) |
| Notify Cron | `extensions/notify-cron` | `notify_cron_*`, `/notify-cron` | Scheduled notifications with typed destinations and lease-aware ticking (source preview) |

## Release scope (now)

Published installer scope is intentionally small right now:

- **Pi Dispatch** (`@codewithkenzo/pi-dispatch`)
- **Theme Switcher** (`@codewithkenzo/pi-theme-switcher`)

Gateway Messaging and Notify Cron remain source-preview while packaging hardening finishes.

## Master plan snapshot (roadmap)

### Planned plugins

- `fs-sandbox` — execution isolation + policy boundaries
- `pi-memory` — short/long/last-active memory lanes
- `pi-board` — mission/task coordination surface (planned to absorb interactive plan-mode workflow)
- `pi-voice` — voice ingress + transcript workflows
- `pi-diff` — structured change/delta workflows
- `pi-rollback` — safe rollback/recovery workflows

### Planned feature phases in Pi Dispatch

- interactive **plan mode** (`/plan` and gated execute flow), converging into the board workflow
- deeper **VFS/preload** ergonomics and token-safe context injection
- **sandbox adapter integration** for safer execution boundaries

## Install

### Published now

- [`@codewithkenzo/pi-dispatch@0.1.0`](https://www.npmjs.com/package/@codewithkenzo/pi-dispatch)
- [`@codewithkenzo/pi-theme-switcher@0.1.0`](https://www.npmjs.com/package/@codewithkenzo/pi-theme-switcher)

### One-command installer (rolling out)

```bash
bunx @codewithkenzo/pi-rig@latest
# or
npx @codewithkenzo/pi-rig@latest
```

If this is not yet available in your region/account, use the source install path below.

### From source

From the repository root:

```bash
bun run setup
```

This installs workspace dependencies, builds the extensions, copies bundled skills, and registers each extension with the Pi coding agent.

Restart the Pi coding agent after setup so the new command surfaces load cleanly.

### Individual extensions (source)

```bash
pi install ./extensions/flow-system
pi install ./extensions/theme-switcher
```

Optional source-preview extensions:

```bash
pi install ./extensions/gateway-messaging
pi install ./extensions/notify-cron
```

### Installer CLI

```bash
bun run --filter @codewithkenzo/pi-rig build
node packages/pi-installer/dist/cli.js
```

Options:

```bash
node packages/pi-installer/dist/cli.js --all
node packages/pi-installer/dist/cli.js --extensions flow-system,theme-switcher
node packages/pi-installer/dist/cli.js --dry-run
node packages/pi-installer/dist/cli.js --pi-path /absolute/path/to/pi
```

### Verify

After install, open a fresh Pi coding agent session:

```
/flow profiles
/theme list
```

If you manually install source-preview plugins, also verify their commands.

## Preview gallery (WIP)

Preview PNG/GIF/video assets are being prepared.

- planned location: `docs/previews/`
- embed/template guide: [docs/PREVIEWS.md](./docs/PREVIEWS.md)

## Development

```bash
bun run typecheck     # typecheck all packages
bun run test          # run all tests
bun run build         # build all packages
```

Each extension is a self-contained Bun workspace package under `extensions/`.

## Documentation

- [Install guide](./docs/INSTALL.md)
- [Usage guide](./docs/USAGE.md)
- [Telegram pairing guide](./docs/TELEGRAM_PAIRING.md)
- [Documentation index](./docs/README.md)
- [Preview asset guide](./docs/PREVIEWS.md)
- [Public go-live checklist](./docs/PUBLIC_GO_LIVE_CHECKLIST.md)

## Contributing

Good contributions are concrete and scoped:

- reproducible bugs with a minimal reproduction case
- contract and schema fixes
- transport reliability improvements
- packaging and install improvements
- focused behavior changes with clear acceptance criteria
- tests that cover failure-prone paths
