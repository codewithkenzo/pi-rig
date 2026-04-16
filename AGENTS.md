# AGENTS.md — pi-rig

Cross-agent shared context for this repository.

---

## Purpose

Pi Rig is a collection of Pi coding agent extensions.
Each extension lives in `extensions/<name>/` as a self-contained TypeScript/Bun package.

---

## Stack

- Runtime: Bun
- Language: TypeScript strict
- Resilience: Effect-TS (`effect@4.0.0-beta.48`) inside extension modules
- Schema: `@sinclair/typebox`
- Pi integration: `@mariozechner/pi-agent-core` (peer dependency)
- Testing: `bun test`

---

## Working workflow (repo)

For non-trivial work:
1. inspect current tracked work (`tk` / `.tickets/` if present locally)
2. read local markdown context (`AGENTS.md`, `README.md`, docs, plans)
3. implement the smallest safe diff
4. verify with typecheck/tests before claiming done

Research lane order:
1. repo search
2. official docs
3. targeted external references

---

## Extension conventions

1. Default export shape: `async (pi: ExtensionAPI) => Promise<void>`
2. Keep Effect internals at module boundaries (`runPromise` / `runPromiseExit`)
3. Use plain services/state values; avoid introducing framework-heavy DI layers
4. Export TypeBox schemas with derived types
5. Use explicit cleanup patterns for temp files/subprocesses
6. Keep extension-native progress in `onUpdate` (do not reimplement core model streaming)

---

## Extensions (current)

| Extension | Path | Status |
|-----------|------|--------|
| flow-system | `extensions/flow-system/` | Implemented (tested) |
| gateway-messaging | `extensions/gateway-messaging/` | Implemented baseline |
| notify-cron | `extensions/notify-cron/` | Implemented baseline |
| theme-switcher | `extensions/theme-switcher/` | Implemented (tested) |

---

## Commands

```bash
# repo root
bun run setup
bun run typecheck
bun run test

# extension directory
bun install
bun tsc --noEmit
bun test
```

Install an extension in Pi:

```bash
pi install /absolute/path/to/extensions/<name>
```

---

## Documentation

- `README.md` — repo overview
- `docs/INSTALL.md` — install flows
- `docs/USAGE.md` — tool/command usage
- `docs/TELEGRAM_PAIRING.md` — Telegram pairing guide

---

## Constraints

- No committing/pushing unless explicitly requested
- No `as any`, `@ts-ignore`, `@ts-expect-error`
- Confirm dangerous/destructive operations first
