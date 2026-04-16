# Next spec synthesis (April 16, 2026)

Scope synthesized from:
- master plan: `~/.claude/plans/scalable-enchanting-rabbit.md`
- audit follow-up: `~/.claude/plans/pure-wibbling-kernighan.md`
- sprint execution notes in `.tickets/pprk-*.md`

## Current extension situation (right now)

| Extension | Path | Status | Notes |
|---|---|---|---|
| Pi Dispatch | `extensions/flow-system` | Implemented, actively hardening | Queue, deck UI, execution envelope/preload, summary-phase indicator all landed |
| Theme Switcher | `extensions/theme-switcher` | Implemented, stable | Ambiguous non-palette theme behavior confirmed intentional |
| Gateway Messaging | `extensions/gateway-messaging` | Implemented baseline | Telegram-first turn formatting + adapter pipeline in place |
| Notify Cron | `extensions/notify-cron` | Implemented baseline | Scheduler + dispatch validation shipped |
| fs-sandbox | `extensions/fs-sandbox` | Planned (next greenfield) | Coordination contract already drafted |
| pi-memory | `extensions/pi-memory` | Planned | Depends on fs-sandbox and mission-control fit |
| pi-board | `extensions/pi-board` | Planned | Mission-control surface not started in this repo |
| pi-voice | `extensions/pi-voice` | Planned | Voice pipeline lane still research-stage |
| pi-diff | `extensions/pi-diff` | Planned | Diff/read-write optimization lane still research-stage |

## Strategic synthesis

### 1) Plan mode depth (Pi Dispatch)
- Keep chat-first UX and compact status line as primary surface.
- Treat plan mode as a strict phase machine (plan -> execute -> verify -> summarize).
- `maxIterations` remains a soft constraint (prompt/hook nudging) until pi runtime exposes a hard flag.

### 2) Gateway + Telegram + notify-cron hot features
- Keep gateway focused on low-noise operator updates (single-message edit model, compact tool rollups).
- Keep notify-cron as lease-aware dispatcher with explicit destinations.
- Next integration increment should be contract-first: gateway event schema + notify dispatch envelope compatibility.

### 3) Diff/read-write optimization
- Preserve current preload envelope in Pi Dispatch as the first token-saving layer.
- Add pi-diff as a structured delta lane rather than replacing core read/write tools.
- Scope first pi-diff spec around “before/after workspace snapshot + summary” contracts for agent trust.

### 4) Token reduction
- Continue bounded context preloading (dirs/files/commands) as the default path.
- Prefer deterministic summarization packets over long raw logs.
- Keep output caps and summary-phase signaling so UI surfaces remain truthful under long runs.

### 5) fs-sandbox + Code Mode + VFS boundaries
- Keep extension-to-extension integration adapter-based (no direct cross-import coupling).
- Maintain `flow-system` executor adapter contract as the seam for fs-sandbox policy enforcement.
- Preserve VFS discipline: temporary staged files + guaranteed cleanup, with sandbox policy wrapping execution boundaries.

## What should happen next

1. Start `fs-sandbox` scaffold from the existing coordination design (`docs/architecture/fs-sandbox-coordination.md`).
2. Add adapter lifecycle tests in Pi Dispatch before plugging real fs-sandbox execution.
3. Write first pi-diff spec focused on structured delta output contracts.
4. Defer deep plan-mode UX expansion until fs-sandbox execution boundaries are stable.

## Guardrails to preserve

- Keep `scalable-enchanting-rabbit.md` as the master roadmap source.
- Keep `tk` as lifecycle source of truth, markdown as durable design memory.
- No speculative refactors outside scoped tickets.
