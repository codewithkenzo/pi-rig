# Editing theme colors (Kenzo)

**Source of truth:** `shared/theme/palette.ts`

- **pi-theme-switcher** palettes: search `export const <name>: Palette`
- **Semantic** (Pi UI): `semantic: semantic("#accent", ...)` — 16 hex args in order: accent, success, error, warning, muted, dim, text, border, highlight, info, active, inactive, header, label, value, separator
- **Extra named colors:** `raw: { key: "#hex", ... }`
- **Hermes bundled skins:** `hermesVesper`, `hermesStorm`, etc. at bottom of `palette.ts`
- **Runtime Hermes YAML:** `~/.hermes/skins/<name>.yaml` (optional override via `hermes-skins.ts`)

## Dev loop

```bash
cd ~/dev/pi-rig/extensions/theme-switcher
bun run build && bun test
pi install ~/dev/pi-rig/extensions/theme-switcher
# restart Pi → /theme list
```

## Export hex dump (optional)

Re-run palette export script or read `~/vaults/kenzo/05-assets/pi-theme-palettes/palettes.json`.

## Publish

Bump `extensions/theme-switcher/package.json` version → commit → push branch → npm publish `@codewithkenzo/pi-theme-switcher`.