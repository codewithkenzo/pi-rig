# Pi Rig

A suite of extensions for the Pi coding agent.

Pi Rig handles the execution, messaging, routing, and workflow state layers that matter most during long agent runs: queued work, remote updates, scheduled delivery, and consistent runtime context.

Pi Rig is built on [pi-mono](https://github.com/badlogic/pi-mono), the open-source Pi coding agent by Mario Zechner, and targets the Pi extension ecosystem around `@mariozechner/pi-agent-core`.

## Extensions

| Extension | Package | Status | Surfaces | Notes |
|---|---|---|---|---|
| [Pi Dispatch](https://github.com/codewithkenzo/pi-dispatch) | [`@codewithkenzo/pi-dispatch`](https://www.npmjs.com/package/@codewithkenzo/pi-dispatch) | **Published** | `flow_run`, `flow_batch`, `/flow` | Core execution and queue lane |
| [Theme Switcher](https://github.com/codewithkenzo/pi-theme-switcher) | [`@codewithkenzo/pi-theme-switcher`](https://www.npmjs.com/package/@codewithkenzo/pi-theme-switcher) | **Published** | `theme_set`, `theme_list`, `theme_preview`, `/theme` | Runtime theming and session restore |
| Gateway Messaging | `@codewithkenzo/pi-gateway-messaging` | Source preview | `gateway_turn_preview`, `/gateway` | Remote turn updates + action routing |
| Notify Cron | `@codewithkenzo/pi-notify-cron` | Source preview | `notify_cron_*`, `/notify-cron` | Scheduled delivery and lease-aware ticks |

## Planned roadmap (structured)

### Planned plugin map

| Plugin | Status | Primary goal | Notes |
|---|---|---|---|
| `fs-sandbox` | Planned | Execution isolation + policy boundaries | sandbox adapter target for Pi Dispatch |
| `pi-memory` | Planned | Short/long/last-active memory lanes | selective injection, markdown-first storage |
| `pi-board` | Planned | Mission/task coordination surface | planned to absorb interactive plan-mode workflow |
| `pi-voice` | Planned | Voice ingress + transcript workflows | pairs with gateway/remote flows |
| `pi-diff` | Planned | Structured change/delta workflows | token-efficient review lane |
| `pi-rollback` | Planned | Safe rollback/recovery workflows | revert/undo safety for risky operations |

### Phase map

| Phase | Scope | What ships |
|---|---|---|
| Phase 1 (now) | Public release baseline | Dispatch + Theme Switcher + installer path |
| Phase 2 (next) | Source preview hardening | Gateway Messaging + Notify Cron packaging hardening |
| Phase 3 (after) | New extension wave | board/memory/sandbox/diff/voice/rollback lanes |

### Pi Dispatch direction

- interactive **plan mode** (`/plan`, gated execute flow) as the bridge into board workflows
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
