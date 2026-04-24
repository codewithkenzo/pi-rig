# Pi Rig plugin system map

## Purpose

Show how Pi Rig plugins can work together without requiring users to install all of them.

This is an integration map, not a promise that every planned capability becomes its own plugin.

## Installation tiers

### Tier 1 — pick-one install

Users may install only one extension. Each plugin must degrade cleanly when peers are missing.

Examples:
- only `pi-dispatch`: flow tools/deck/status work without gateway/sandbox/rollback
- only `theme-switcher`: theme commands work without dispatch
- only `gateway-messaging`: remote updates work without notify-cron

### Tier 2 — useful pairs

| Pair | Integration |
|---|---|
| `pi-dispatch` + `fs-sandbox` | dispatch executor can route runs through sandbox policy adapter |
| `pi-dispatch` + `pi-board` | board creates missions/tickets; dispatch executes scoped agents |
| `pi-dispatch` + `pi-diff` | dispatch can request structured deltas/reviews instead of raw output |
| `gateway-messaging` + `notify-cron` | cron sends remote prompts/notifications through gateway destinations |
| `pi-dispatch` + `gateway-messaging` | background flow progress can be summarized remotely |

### Tier 3 — Kenzo full rig

When all core plugins are installed:
- `pi-board` owns mission/task UX
- `pi-dispatch` owns execution, profiles, queue, deck, team sessions
- `fs-sandbox` owns policy/isolation boundaries
- `pi-diff` owns structured edit/review/delta contracts
- `pi-rollback` owns checkpoint/recovery contracts if promoted
- `gateway-messaging` owns remote delivery/action routing
- `notify-cron` owns scheduled follow-ups
- `theme-switcher` owns visual theme state

## Capability vs plugin boundary

Do not create a standalone plugin until it has a clear independent install value and API boundary.

| Capability | Default home now | Promote to plugin when |
|---|---|---|
| team orchestration | `pi-dispatch` | multiple plugins need shared team/session model |
| compact status line | `pi-dispatch` HUD/status | Pi exposes cross-plugin status aggregation API |
| dynamic context packs | `pi-dispatch` + future board | packs need shared registry across plugins |
| hook policy | `pi-dispatch` initially | hooks become cross-plugin lifecycle standard |
| sandbox execution | `fs-sandbox` | already distinct: policy/isolation |
| structured diff/cushion | `pi-diff` candidate | delta format is stable and useful standalone |
| rollback/recovery | candidate, not committed | checkpoint + undo log works across plugins safely |

## Integration principles

1. Adapter seams over direct imports.
2. Every plugin works alone.
3. Cross-plugin features are opportunistic and observable.
4. No hidden branch/file mutation across plugins.
5. Shared vocabulary beats shared state: status, topology, context freshness, failure class.
6. Durable memory goes to tk/docs/session summaries, not invisible plugin internals.

## Shared vocabulary

Statuses:
- `pending`
- `running`
- `writing-summary`
- `blocked`
- `done`
- `failed`
- `cancelled`

Team topology:
- `fanout`
- `chain`
- `review-loop`
- `debate`
- `handoff`
- `supervision`

Context state:
- `fresh`
- `preloaded`
- `hooked`
- `stale`
- `missing`
- `error`

Failure classes:
- `tool`
- `model`
- `timeout`
- `context`
- `merge`
- `policy`
- `unknown`

## Open decisions

1. Should `pi-board` own plan mode, or should `pi-dispatch` keep plan mode and expose board adapters?
2. Should rollback be a separate plugin or a sandbox/diff capability?
3. Should context packs be project-local JSON, TypeScript hooks, or both?
4. Should status-line aggregation live in Pi core, `pi-dispatch`, or a future small plugin?
5. What is the minimum useful public API for team session events?
