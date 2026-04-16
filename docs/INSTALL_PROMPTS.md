# Install prompts for agents

Copy one of these prompts into Pi, Claude Code, Codex, or another coding agent when you want installation handled for you.

## For your agent (direct setup copy)

````md
Install Pi Rig with direct setup.

Requirements:
- Prefer Bun:
  - `bunx @codewithkenzo/pi-rig@latest`
- If Bun is unavailable, use npm:
  - `npx @codewithkenzo/pi-rig@latest`
- Install current core set only:
  - Pi Dispatch
  - Theme Switcher
- Restart Pi if needed.
- Verify:
  - `/flow profiles`
  - `/theme list`
- Report exactly what was installed.
````

## Prompt: one-command installer

Use this for direct installer setup.

````md
Install Pi Rig with the one-command installer.

Requirements:
- Prefer `bunx @codewithkenzo/pi-rig@latest`.
- If Bun is unavailable, fall back to `npx @codewithkenzo/pi-rig@latest`.
- Use the interactive selector when a human is present.
- In non-interactive mode, install the current core set only:
  - Pi Dispatch
  - Theme Switcher
- Restart Pi after install if needed.
- Verify:
  - `/flow profiles`
  - `/theme list`
- Report exactly what was installed and any follow-up steps.
````

## Prompt: source checkout path

Use this when installing from a local checkout (dev/workspace flow).

````md
Install Pi Rig from the local repository checkout.

Requirements:
- From repo root, run `bun run setup`.
- If package selection is preferred, run:
  - `bun run --filter @codewithkenzo/pi-rig build`
  - `node packages/pi-installer/dist/cli.js`
- Restart Pi after install if needed.
- Verify:
  - `/flow profiles`
  - `/theme list`
- Report exactly what was installed and any follow-up steps.
````

## Prompt: source install for selected packages

````md
Install selected Pi Rig plugins from the local checkout.

Requirements:
- Install only these paths unless the human changes scope:
  - Pi Dispatch: `./extensions/flow-system`
  - Theme Switcher: `./extensions/theme-switcher`
- Optional source-preview plugins only when explicitly requested:
  - `./extensions/gateway-messaging`
  - `./extensions/notify-cron`
- Use `pi install <path>` for each selected package.
- Restart Pi after install if needed.
- Verify installed commands and report final state.
````
