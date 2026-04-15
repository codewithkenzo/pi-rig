# Theme Switcher

Theme Switcher is a Pi coding agent extension for runtime theme selection and preview.

## Current status

Finished slice:

- `theme_set`, `theme_list`, `theme_preview`
- `/theme status|set|list|preview|cycle`
- session restore and agent-end persistence
- current-theme context injection
- bundled skill at `skills/theme-switcher/SKILL.md`

## Development

```bash
cd extensions/theme-switcher
bun install
bun run build
bun tsc --noEmit
bun test
```

The Pi coding agent should load the built runtime entry at `dist/index.js`, not the raw TypeScript source.

## Design source

Implementation notes live in:

- `.claude/plans/scalable-enchanting-rabbit.md` (master plan)
- `.tickets/extensions/theme-switcher/` (active execution tickets)
