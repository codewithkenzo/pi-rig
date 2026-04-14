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
- **Virtual FS**: Temp file staging (node:fs) — skill content written to tmpdir, cleaned up via acquireUseRelease
- **Pi integration**: @mariozechner/pi-agent-core (peerDependency, never bundled)
- **Testing**: `bun test` (bun:test), no Vitest

---

## Extension Conventions

1. Default export is `async (pi: ExtensionAPI) => Promise<void>`
2. Effect-TS never leaks past module boundaries — convert with `Effect.runPromise` / `Effect.runPromiseExit`
3. No `Layer` or `Context.Tag` — pass services as plain values
4. Tagged errors use `Data.TaggedError("Tag")<{ fields }>` without trailing `()` (Bun 1.3+ requirement)
5. All TypeBox schemas exported alongside their derived types
6. Subprocess cleanup uses `Effect.async` with cleanup return + `acquireUseRelease` for temp files
7. Skill file cache is module-level singleton — never per-call

---

## Extensions

| Extension | Path | Status |
|-----------|------|--------|
| flow-system | `extensions/flow-system/` | Implemented (needs tests) |

### flow-system

Flow profiles, job queue, and skill injection for pi subagent orchestration.

**Tools**: `flow_run` (single task, fg/bg), `flow_batch` (sequential/parallel batch)
**Command**: `/flow status | cancel <id> | profiles`

**Architecture**:

```
extensions/flow-system/
  index.ts              Entry — wires queue, tools, commands, session events
  src/types.ts          TypeBox schemas + tagged errors (FlowJob, FlowProfile, etc.)
  src/queue.ts          In-memory job queue (Effect Ref<FlowQueue>)
  src/profiles.ts       Built-in profiles + JSON override loading
  src/executor.ts       pi subprocess runner (Effect.async + acquireUseRelease)
  src/vfs.ts            Skill file staging with temp file lifecycle
  src/tool.ts           flow_run tool
  src/batch-tool.ts     flow_batch tool
  src/commands.ts       /flow command handler
```

**Key patterns**:
- Effect-TS at boundaries only — `runPromise`/`runPromiseExit` at pi API surface
- Tagged errors without trailing `()` (Bun 1.3+)
- `acquireUseRelease` for temp file cleanup (even on interruption)
- Session persistence via custom entries (`agent_end` snapshot, `session_start` restore)
- 6 built-in profiles: explore, research, coder, debug, browser, ambivalent

**Known issues** (from Codex review 2026-04-14):
- TOCTOU race in `queue.ts` cancel/setStatus — should use `Ref.modify` for atomicity
- Background job error path in `tool.ts` could produce unhandled rejection if `setStatus` fails
- No SIGKILL escalation for stuck subprocesses (minor)

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
