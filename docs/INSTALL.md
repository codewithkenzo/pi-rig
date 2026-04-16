# Install

## Prerequisites

- [Bun](https://bun.sh)
- [Pi coding agent](https://github.com/badlogic/pi-mono) installed and available on your machine
- a fresh Pi coding agent session after install so new command surfaces load cleanly

## Recommended release path

Published packages now:

- `@codewithkenzo/pi-dispatch@0.1.0`
- `@codewithkenzo/pi-theme-switcher@0.1.0`

Installer package is rolling out. Intended command:

```bash
bunx @codewithkenzo/pi-rig@latest
# or
npx @codewithkenzo/pi-rig@latest
```

The installer supports both humans and agents:

- interactive plugin selection
- explicit flags for deterministic setup
- install all available plugins or a selected subset
- simple plugin labels and descriptions during selection

Current one-command installer scope: **Pi Dispatch + Theme Switcher**.
Additional plugins are planned in later phases.

If `@codewithkenzo/pi-rig` is not available yet for your registry/account view, use source install temporarily.

## Current source path

Until the published installer path is live, install from this repository.

From the repository root:

```bash
bun run setup
```

That flow:

1. installs workspace dependencies
2. typechecks shared code
3. builds the selected extension packages
4. copies bundled skills
5. installs each extension into the Pi coding agent

## Current source installer CLI

If you want the selector flow from the repository today:

```bash
bun run --filter @codewithkenzo/pi-rig build
node packages/pi-installer/dist/cli.js
```

Useful options:

```bash
node packages/pi-installer/dist/cli.js --all
node packages/pi-installer/dist/cli.js --extensions flow-system,theme-switcher
node packages/pi-installer/dist/cli.js --dry-run
node packages/pi-installer/dist/cli.js --no-skills
node packages/pi-installer/dist/cli.js --pi-path /absolute/path/to/pi
```

## Individual package install from source

```bash
pi install ./extensions/flow-system
pi install ./extensions/theme-switcher
```

Optional source-preview packages:

```bash
pi install ./extensions/gateway-messaging
pi install ./extensions/notify-cron
```

Current source path to public label mapping:

- `extensions/flow-system` → Pi Dispatch
- `extensions/theme-switcher` → Theme Switcher
- `extensions/gateway-messaging` → Gateway Messaging
- `extensions/notify-cron` → Notify Cron

## Verify the install

Check the installed extensions:

```bash
pi list
```

Then open a fresh Pi coding agent session and run:

```text
/flow profiles
/theme list
```

If you installed extra source plugins manually, also verify their commands.

## If commands are missing

Usually one of these applies:

1. the Pi coding agent was already open before the extension install completed
2. the extension path is not present in `pi list`
3. project-local Pi settings differ from user-level settings

Fast recovery path (current one-command scope):

```bash
pi install ./extensions/flow-system
pi install ./extensions/theme-switcher
```

(Optional source plugins can still be installed manually.)

Then start a fresh Pi coding agent session.

## Provider auth

The installer does not handle provider login.

- extensions reuse your existing Pi coding agent auth and provider setup
- configure provider credentials with the normal Pi flow for your environment

## Development install loop

Example with one extension:

```bash
cd extensions/theme-switcher
bun install
bun run build
bun run typecheck
bun test

pi install /absolute/path/to/extensions/theme-switcher
```
