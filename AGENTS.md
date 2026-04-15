# AGENTS.md — pi-plugins-repo-kenzo

Cross-agent shared context. Single source of truth for Claude Code, Codex, and Hermes.

---

## Purpose

A collection of pi agent extensions (https://github.com/badlogic/pi-mono). Each extension lives in `extensions/<name>/` and is a self-contained TypeScript Bun package.

---

## Stack

- **Runtime**: Bun (never npm/yarn)
- **Language**: TypeScript strict (no `as any`, no `@ts-ignore`)
- **Resilience**: Effect-TS v4 beta (`effect@4.0.0-beta.48`) — all async/error handling inside modules
- **Schema**: @sinclair/typebox ^0.34 — types derived from schemas via `Static<>`
- **Virtual FS**: Temp file staging (node:fs) — skill content written to tmpdir, cleaned up via acquireUseRelease
- **Pi integration**: @mariozechner/pi-agent-core (peerDependency, never bundled)
- **Testing**: `bun test` (bun:test), no Vitest

---

## Priority Workflow

For non-trivial work:
1. check `tk` / `.tickets/` first
2. read local markdown context (`AGENTS.md`, `README.md`, plans, sprint tickets)
3. load matching skills
4. use mcporter-backed research only when repo facts are insufficient

Research lane order:
1. repo search
2. Context7 docs
3. Exa fetch / zread
4. grep.app / `gh search code`
5. Exa web

Notes:
- `tk` is the prevailing project memory/lifecycle lane for now
- markdown is the durable context lane
- mcporter is a dev-ops research lane, not a product extension in this repo

## Extension Conventions

1. Default export is `async (pi: ExtensionAPI) => Promise<void>`
2. Effect-TS never leaks past module boundaries — convert with `Effect.runPromise` / `Effect.runPromiseExit`
3. No `Layer` or `Context.Tag` — pass services as plain values
4. Tagged errors use `Data.TaggedError("Tag")<{ fields }>` without trailing `()` (Bun 1.3+ requirement)
5. All TypeBox schemas exported alongside their derived types
6. Subprocess cleanup uses `Effect.callback` with cleanup return + `acquireUseRelease` for temp files
7. Skill file cache is module-level singleton — never per-call
8. For extension-bundled skills, the parent directory name must match the skill `name` in `SKILL.md`
9. In extension tools, use `onUpdate` only for extension-native progress/status; do not recreate core model streaming inside the extension
10. In this repo, do not introduce `Layer`, `Context.Tag`, or `ManagedRuntime`; keep extension state/services as plain values

---

## Extensions

| Extension | Path | Status |
|-----------|------|--------|
| flow-system | `extensions/flow-system/` | Implemented (tested) |
| gateway-messaging | `extensions/gateway-messaging/` | Implemented (turn-state + adapter pipeline) |
| notify-cron | `extensions/notify-cron/` | Implemented (scheduler + dispatch validation) |
| theme-switcher | `extensions/theme-switcher/` | Implemented (tools, commands, lifecycle hooks) |

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
  src/executor.ts       pi subprocess runner (Effect.callback + acquireUseRelease)
  src/vfs.ts            Skill file staging with temp file lifecycle
  src/tool.ts           flow_run tool
  src/batch-tool.ts     flow_batch tool
  src/commands.ts       /flow command handler (showFlowManager capability gate)
  src/deck/index.ts     showFlowDeck() — 3-zone TUI overlay factory
  src/deck/state.ts     DeckState plain objects + feed dedup/sanitization
  src/deck/icons.ts     DECK_ICONS (Nerd Font / ASCII fallback via PI_ASCII_ICONS=1)
  src/deck/layout.ts    visibleWidth(), fitAnsiColumn(), zipColumns()
  src/deck/header.ts    Zone 1 — title + badge + clock (shimmer/pulse)
  src/deck/columns.ts   Zone 2 — profile panel + activity feed
  src/deck/summary.ts   Zone 3 — scrollable subprocess output (sanitized)
  src/deck/footer.ts    Zone 4 — keybind pills with key-flash feedback
```

**Key patterns**:
- Effect-TS at boundaries only — `runPromise`/`runPromiseExit` at pi API surface
- Tagged errors without trailing `()` (Bun 1.3+)
- `acquireUseRelease` for temp file cleanup (even on interruption)
- Session persistence via custom entries (`agent_end` snapshot, `session_start` restore)
- 6 built-in profiles: explore, research, coder, debug, browser, ambivalent
- Deck TUI: `AnimationTicker` drives 4–8 fps render; `withMotion()` guards every animation primitive
- `fitAnsiColumn(text, width)` — ANSI-preserving column fit; use instead of `truncateToWidth` for colored output
- Feed sanitization: `stripAnsi() + FEED_CONTROL_RE` on ingest, not at render time
- Overlay init failures fall back to text via `showFlowManager()` try/catch

**Known issues** (updated 2026-04-15):
- Queue `maxConcurrent` now controls queue state, but real-world fairness still depends on tool-side execution pacing for long-running jobs.
- Re-registration safety is API-instance scoped (WeakSet guard); if host semantics change, revisit unload/teardown behavior.

---

## Commands

```bash
# From repo root:
bun run setup        # install deps + typecheck packages + try pi registration
bun run typecheck    # workspace typecheck
bun run test         # workspace tests

# In any extension directory:
bun install          # install deps
bun tsc --noEmit     # typecheck
bun test             # run tests

# Install extension in pi:
# /extension install /path/to/extensions/flow-system
# /extension install /path/to/extensions/theme-switcher
```

---

## Skills

- `kenzo-pi-extensions` — pi ExtensionAPI reference
- `kenzo-pi-flow-stack` — Effect + VFS + TypeBox + flow patterns
- `kenzo-house-spec` — repo/global ownership + mirroring rules
- `kenzo-publishing-voice` — public writing guidance
- `kenzo-tk-cli` — task tracking + lifecycle memory
- `kenzo-research-tools` / `kenzo-mcporter` — external research lane routing

## Documentation

- `README.md` — repo overview and quick start
- `docs/INSTALL.md` — install paths and setup script usage
- `docs/USAGE.md` — current extension and repo usage
- `docs/KENZO_HOUSE_SPEC.md` — project/global split for repo, Claude, Codex, and Hermes
- `docs/playbooks/KENZO_PUBLISHING_VOICE.md` — publishing and growth voice guidance

---

## Constraints

- No committing or pushing without explicit instruction
- No `as any`, no `@ts-ignore`
- Dangerous ops require confirmation
