# Pi Rig

A compact workflow stack for the Pi coding agent.

Pi Rig is a suite of extensions for the Pi coding agent, built for daily work with AI coding agents. It focuses on execution, messaging, routing, and workflow state in real workspaces: the areas where long runs, remote updates, queueing, and repeated iteration need to stay readable and reliable.

## Install

### Recommended release path

```bash
bunx @codewithkenzo/pi-rig@latest
# or
npx @codewithkenzo/pi-rig@latest
```

Planned distribution channels include the installer package, source installs, and AUR packages once the release path is stable.

The installer is designed to work well for both humans and agents:

- interactive selection for manual setup
- explicit flags for deterministic setup
- install all packages or a selected subset
- package labels and descriptions during selection

### Current source path

Until the published installer is live, install from this repository:

```bash
bun run setup
```

That command installs dependencies, builds the shipped extensions, copies bundled skills, and installs the extensions into the Pi coding agent.

Restart the Pi coding agent after setup so the command surfaces load in a fresh session.

### Current source installer CLI

```bash
bun run --filter @codewithkenzo/pi-rig build
node packages/pi-installer/dist/cli.js
```

Examples:

```bash
node packages/pi-installer/dist/cli.js --all
node packages/pi-installer/dist/cli.js --extensions flow-system,gateway-messaging
node packages/pi-installer/dist/cli.js --dry-run
```

## Included now

| Label | Current source path | Surface | Summary |
| --- | --- | --- | --- |
| Pi Dispatch | `extensions/flow-system` | `flow_run`, `flow_batch`, `/flow` | Profile-based execution for queued runs, reusable task envelopes, and subagent work |
| Theme Switcher | `extensions/theme-switcher` | `theme_set`, `theme_list`, `theme_preview`, `/theme` | Runtime theme switching and preview |
| Gateway Messaging | `extensions/gateway-messaging` | `gateway_turn_preview`, `/gateway status` | Telegram-first messaging runtime with patch queues, action payloads, and turn-state formatting |
| Notify Cron | `extensions/notify-cron` | `notify_cron_*`, `/notify-cron` | Scheduled notifications with explicit destinations and lease-aware ticking |

## What Pi Rig helps with

- cleaner multi-step execution
- lower-noise remote updates
- stronger control over workflow state
- queue-aware task handling
- tighter workspace integration
- installs that are simple enough for both humans and agents to operate

## Package notes

### Pi Dispatch

Pi Dispatch is the execution layer of the suite.

Current focus:

- named profiles
- background and foreground runs
- queue-aware orchestration
- skill injection
- execution-envelope hardening
- structured preload and context injection
- future plan-mode and sandbox integration

### Theme Switcher

Theme Switcher handles runtime theme selection, preview, and session-aware restore behavior.

### Gateway Messaging

Gateway Messaging handles turn formatting for remote delivery.

Current focus:

- single-message turn rendering
- self-editing update model
- structured action payloads
- tool-stream rollups
- lower-noise remote messaging
- future inline controls and richer transport adapters

### Notify Cron

Notify Cron handles scheduled delivery with typed destinations, envelopes, and execution boundaries.

## Planned areas

Upcoming work in the suite includes:

- flow-driven plan mode with structured phase transitions
- sandboxed execution with a code-mode-compatible shape
- filesystem-first memory with optional embedding backends
- gateway-ready voice pipelines using live STT and STT/TTS flows
- deeper structured data flow between execution, messaging, and notification layers

## Documentation

- [Documentation index](./docs/README.md)
- [Install guide](./docs/INSTALL.md)
- [Install prompts for agents](./docs/INSTALL_PROMPTS.md)
- [Usage guide](./docs/USAGE.md)
- [Telegram pairing guide](./docs/TELEGRAM_PAIRING.md)
- [Metadata and package descriptions](./docs/METADATA.md)

## Contributing

Pi Rig is built to contribute useful Pi coding agent extension patterns back to the community.

Good contributions are usually concrete and scoped:

- reproducible bugs
- contract and schema fixes
- transport reliability improvements
- packaging and install polish
- focused UX improvements with clear behavior changes
- tests that lock down failure-prone edges

## Status

The shipped packages are usable now. Public package release is still being tightened around installer polish, execution envelopes, and remote messaging UX.
