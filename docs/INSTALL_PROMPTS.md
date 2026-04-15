# Install prompts for agents

Copy one of these prompts into the Pi coding agent, Claude Code, Codex, or another coding agent when you want the install handled for you.

## Prompt: published installer path

Use this once the installer package is published.

````md
Install Pi Rig with the published installer.

Requirements:
- Prefer `bunx @codewithkenzo/pi-rig@latest`.
- If Bun is unavailable, fall back to `npx @codewithkenzo/pi-rig@latest`.
- Use the interactive selector if a human is present.
- If running non-interactively, install the recommended core set:
  - Pi Dispatch
  - Gateway Messaging
  - Notify Cron
- Restart the Pi coding agent after install if needed.
- Verify the install by running:
  - `/flow profiles`
  - `/gateway status`
  - `/notify-cron status`
- Report exactly what was installed and any follow-up steps.
````

## Prompt: source checkout path

Use this when installing from a git clone or local checkout before the published installer path is available.

````md
Install Pi Rig from the local repository checkout.

Requirements:
- From the repo root, run `bun run setup`.
- If the human wants package selection instead of the full setup path, build and run the installer CLI:
  - `bun run --filter @codewithkenzo/pi-rig build`
  - `node packages/pi-installer/dist/cli.js`
- Restart the Pi coding agent after install if needed.
- Verify the install by running:
  - `/flow profiles`
  - `/theme list`
  - `/gateway status`
  - `/notify-cron status`
- Report exactly what was installed and any follow-up steps.
````

## Prompt: source install for selected packages only

````md
Install selected Pi Rig packages from the local repository checkout.

Requirements:
- Install only these packages unless the human changes the list:
  - Pi Dispatch from `./extensions/flow-system`
  - Gateway Messaging from `./extensions/gateway-messaging`
- Use `pi install <path>` for each selected package.
- Restart the Pi coding agent after install if needed.
- Verify the install by running:
  - `/flow profiles`
  - `/gateway status`
- Report exactly what was installed and any missing prerequisites.
````
