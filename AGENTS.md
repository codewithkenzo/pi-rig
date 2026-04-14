# AGENTS.md — pi-plugins-repo-kenzo

Cross-agent shared context. Single source of truth for Claude Code, Codex, and Hermes.

---

## Purpose

A collection of pi agent extensions (https://github.com/badlogic/pi-mono). Each extension lives in `extensions/<name>/` and is a self-contained TypeScript Bun package.

---

## Stack

- **Runtime**: Bun (never npm/yarn)
- **Language**: TypeScript strict (no `as any`, no `@ts-ignore`)
- **Resilience**: Effect-TS v3 — all async/error handling inside modules
- **Schema**: @sinclair/typebox ^0.34 — types derived from schemas via `Static<>`
- **Virtual FS**: @platformatic/vfs — in-process staging only
- **Pi integration**: @mariozechner/pi-agent-core (peerDependency, never bundled)
- **Testing**: `bun test` (bun:test), no Vitest

---

## Extension Conventions

1. Default export is `async (pi: ExtensionAPI) => Promise<void>`
2. Effect-TS never leaks past module boundaries — convert with `Effect.runPromise` / `Effect.runPromiseExit`
3. No `Layer` or `Context.Tag` — pass services as plain values
4. Tagged errors use `Data.TaggedError("Tag")<{ fields }>` without trailing `()` (Bun 1.3+ requirement)
5. All TypeBox schemas exported alongside their derived types
6. Subprocess cleanup uses `Effect.ensuring`, never `try/finally`
7. VFS instances are module-level singletons — never per-call

---

## Extensions

| Extension | Path | Status |
|-----------|------|--------|
| flow-system | `extensions/flow-system/` | In progress |

---

## Commands

```bash
# In any extension directory:
bun install          # install deps
bun tsc --noEmit     # typecheck
bun test             # run tests

# Install extension in pi:
# /extension install /path/to/extensions/flow-system
```

---

## Skills

- `kenzo-pi-extensions` — pi ExtensionAPI reference (tools, events, commands, sub-agents)
- `kenzo-pi-flow-stack` — stack patterns (Effect + VFS + TypeBox + built-in profiles)

---

## Constraints

- No committing or pushing without explicit instruction
- No `as any`, no `@ts-ignore`
- Dangerous ops require confirmation
