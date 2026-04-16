# Next spec synthesis (April 2026)

This note summarizes near-term architecture direction for Pi Rig extensions.

## Current extension situation

| Extension | Path | Status | Notes |
|---|---|---|---|
| Pi Dispatch | `extensions/flow-system` | Implemented, actively hardening | Queue, deck UI, and execution envelope lanes are in place |
| Theme Switcher | `extensions/theme-switcher` | Implemented, stable | Runtime theme switching + preview |
| Gateway Messaging | `extensions/gateway-messaging` | Implemented baseline | Telegram-first turn formatting + adapter pipeline |
| Notify Cron | `extensions/notify-cron` | Implemented baseline | Scheduler + dispatch validation |
| fs-sandbox | `extensions/fs-sandbox` | Planned | Execution isolation contract drafted |
| pi-memory | `extensions/pi-memory` | Planned | Filesystem-first memory direction |
| pi-board | `extensions/pi-board` | Planned | Task/mission-control layer |
| pi-voice | `extensions/pi-voice` | Planned | Voice pipeline remains research-stage |
| pi-diff | `extensions/pi-diff` | Planned | Structured diff lane remains research-stage |
| pi-rollback | `extensions/pi-rollback` | Planned | Roll back risky extension/runtime changes with safer recovery flows |

## Strategic synthesis

### 1) Plan mode depth (Pi Dispatch)
- Keep chat-first UX and compact status line as primary surface.
- Treat plan mode as a strict phase machine (`plan -> execute -> verify -> summarize`).
- Keep `maxIterations` as a soft orchestration constraint until runtime adds hard caps.

### 2) Gateway + Telegram + notify-cron
- Keep gateway focused on low-noise operator updates (single-message edit model, compact tool rollups).
- Keep notify-cron lease-aware with explicit destinations.
- Prioritize contract-first interoperability between gateway events and notify envelopes.

### 3) Diff/read-write optimization
- Keep bounded preload envelopes as the first token-saving lane.
- Add pi-diff as a structured delta layer rather than replacing core read/write tools.

### 4) Token reduction
- Prefer bounded preloading and deterministic summaries over long raw logs.
- Keep output caps and summary-phase signals so UI remains truthful under long runs.

### 5) fs-sandbox + Code Mode + VFS boundaries
- Keep extension-to-extension integration adapter-based (no direct coupling).
- Maintain flow executor adapter seam for sandbox policy enforcement.
- Preserve VFS discipline: temporary staged files + guaranteed cleanup.

## Recommended next steps

1. Start fs-sandbox scaffold from existing coordination design.
2. Add adapter lifecycle tests in Pi Dispatch before plugging real sandbox execution.
3. Write first pi-diff spec focused on structured delta output contracts.
4. Draft pi-rollback recovery contracts (target, scope, confirmation, undo log).
5. Defer deep plan-mode UX expansion until execution boundaries are stable.

## Guardrails

- Keep roadmap claims honest (implemented vs partial vs planned).
- Keep changes small and verifiable.
- Avoid speculative refactors outside scoped work.
