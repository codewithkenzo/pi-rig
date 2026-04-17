# @codewithkenzo/pi-rig

Interactive installer for all published Pi Rig extensions.

Use this to install multiple extensions at once. For a single extension, `pi install` is simpler.

## Install all extensions

### Bun

```bash
bunx @codewithkenzo/pi-rig@latest
```

### npm

```bash
npx @codewithkenzo/pi-rig@latest
```

## Install a single extension directly

```bash
pi install npm:@codewithkenzo/pi-dispatch
pi install npm:@codewithkenzo/pi-theme-switcher
```

## Current install scope

- `@codewithkenzo/pi-dispatch` — Pi Dispatch
- `@codewithkenzo/pi-theme-switcher` — Theme Switcher

More plugins are planned for later phases.

## Options

```bash
bunx @codewithkenzo/pi-rig@latest --all                # skip selector, install everything
bunx @codewithkenzo/pi-rig@latest --extensions dispatch # install specific plugins
bunx @codewithkenzo/pi-rig@latest --dry-run             # preview without executing
bunx @codewithkenzo/pi-rig@latest --pi-path /path/to/pi # custom pi binary
bunx @codewithkenzo/pi-rig@latest --no-skills           # skip skill bundle install
bunx @codewithkenzo/pi-rig@latest --skip-install        # skip bun install step
```

## Non-interactive mode

When stdin is not a TTY (agents, CI, piped input), the installer auto-selects all available extensions and runs without prompting.
