# Flow Deck v2 Sprint 2 Plan

Date: 2026-04-27
Branch/worktree: `feat/flow-deck-v2` at `/home/kenzo/dev/pi-plugins-repo-kenzo-worktrees/flow-deck-v2`
Primary spec: `docs/dev/flow-deck-v2-blueprint.md`
Design source: `DESIGN.md`

## Goal

Finish Sprint 2 by turning the current safe-but-stacked Flow Deck v2 overlay into the locked mission-control layout:

- wide mode: true 3-region body with queue rail, live activity/coordinator facts, and right detail/summary pane
- medium/compact mode: stable stacked/toggled fallback with no layout jump
- all render paths: fixed frame height, exact-width rows, bounded selectors, no transcript scans during redraw
- continue to keep team/status work API-gated and additive; no queue execution semantic changes in Sprint 2

## Non-goals

- no TeamService or autonomous `team_run` implementation in Sprint 2
- no child-session live context injection unless a real control channel is implemented/proven later
- no persistent journal or queue snapshot contract expansion for deck-only visuals
- no web dashboard, new dependency, or heavy state library
- no extra screens beyond main deck + status line segment

## Linked tickets and anchors

| Ticket | Sprint 2 disposition | Plan anchor | Notes |
|---|---|---|---|
| `prfdv-pent` Flow Deck v2 redesign | parent epic | `#goal` | Keep epic open until Sprint 2/3 complete. |
| `prfdv-hyc2` Sprint 2 hero overlay/stable streaming | primary implementation ticket | `#slice-1-sprint-2-core-hero-body` | Main acceptance gate for this plan. |
| `fdv-1mnx` Flow team orchestration/dynamic flow techniques | parallel planning/spec lane only | `#slice-4-team-orchestration-planning-lane` | Do not mix deep team runtime changes into Sprint 2 layout diff. |
| `fdv-6k8u` diagnostics follow-up | early debug verification lane | `#slice-0-preflight-and-diagnostics` | Verify installed/retried diagnostics or record why retry is blocked. |
| `fdv-tm98` team-aware status line states | additive selector/test prototype after core layout | `#slice-3-team-aware-status-line-prototype` | Use fixture/selector state only unless team API exists. |
| `prfdv-8c1g` Sprint 3 polish | blocked follow-up | `#anything-missed--review-next` | Start only after `prfdv-hyc2` acceptance. |
| `fdv-y5gh` team sessions/context packs/hooks spec | blocked follow-up under `fdv-1mnx` | `#slice-4-team-orchestration-planning-lane` | Unblock after team runtime boundaries are accepted. |

Spec anchors:
- `docs/dev/flow-deck-v2-blueprint.md#sprint-2--hero-overlay--stable-streaming-layout`
- `docs/dev/flow-deck-v2-blueprint.md#status-line-v2-companion-contract`
- `docs/dev/flow-deck-v2-blueprint.md#team-orchestration-expansion-track`
- `DESIGN.md#implementation-mapping`

## Plan

### Slice 0: preflight and diagnostics

Owner/agent: coordinator + debugging agent.
Tickets: `fdv-6k8u`, setup for `prfdv-hyc2`.
Skills: `kenzo-agent-preflight`, `kenzo-pi-flow-stack`, `systematic-debugging`, `structured-return`.

Tasks:
1. Run branch/worktree preflight before any implementation agent starts:
   - `git status -sb`
   - `git worktree list`
   - `tk show prfdv-hyc2 fdv-6k8u fdv-tm98 fdv-1mnx`
2. Confirm no other live agent owns this exact worktree. If multi-agent, create isolated worktree per ticket; shared sprint branch okay, shared live worktree not okay.
3. Run/record baseline gates in `extensions/flow-system` before layout diff if time allows:
   - `bun run typecheck`
   - `bun test --timeout 15000`
   - `bun run build`
4. For `fdv-6k8u`, retry/observe diagnostics in installed/runtime context when Anthropic usage limits permit. Expected diagnostic fields for empty stderr: exitCode, signal, profile, cwd, model/provider, command, watchdog reason, last JSON/event text.
5. If retry cannot run, add tk note stating blocker; do not block Sprint 2 layout on unavailable external quota.

Acceptance:
- implementation lane starts from clean/known branch state
- diagnostics follow-up has either runtime evidence or explicit blocked note
- no code agent launched without ticket + branch/worktree ownership

### Slice 1: Sprint 2 core hero body

Owner/agent: primary builder.
Ticket: `prfdv-hyc2`.
Skills: `kenzo-pi-flow-stack`, `kenzo-pi-extensions`, `kenzo-bun`, `structured-return`.

Tasks:
1. Rework deck body layout around `DESIGN.md` ratios:
   - left rail: 26–31%
   - center stream/facts: 37–44%
   - right detail/summary: 30–32%
2. Keep `FlowQueueService` and `FlowActivityJournalService` as sources. Use existing pure selectors:
   - `selectQueueRailRows`
   - `selectStreamRows` / `selectVisibleStreamRows`
   - `selectActivityDisplayRows`
   - `selectCoordinatorDetail`
3. Introduce/extend frame/body layout helpers so wide render returns one stable body section instead of stacked rail/feed + bottom summary.
4. Render wide mode as:
   - top bar
   - one 3-column hero body with fixed height
   - footer
5. In center pane, make live activity first-class and fixed-height; include selected job/coordinator truth only from current job/journal facts.
6. In right pane, render selected detail/summary from `selectCoordinatorDetail`; no fake packets/artifacts/topology rows.
7. Preserve current stable frame and exact-width safety:
   - every returned line passes `fitAnsiColumn`
   - no tabs/newlines/control bytes leak into render rows
   - no full output/transcript scan during redraw
8. Keep selected subagent unmistakable using DESIGN recipe: accent left strip, raised/bold text, semantic tone only where backed by state.

Acceptance:
- at width >= 96, deck visibly has three regions in one body row stack
- selected row remains obvious in 1, 12, and 30-job queues
- stream viewport height does not change while rows append or summary starts
- summary/detail pane is visually distinct from stream and does not steal full lower half in wide mode
- existing queue/status/job semantics unchanged

### Slice 2: compact fallback and render hardening

Owner/agent: primary builder, then reviewer.
Ticket: `prfdv-hyc2`.
Skills: `kenzo-pi-flow-stack`, `kenzo-codex-review`, `structured-return`.

Tasks:
1. Preserve medium/compact degradation:
   - medium: right detail becomes stacked/toggled detail or lower detail section, but frame height stays fixed
   - narrow: rail + selected stream/detail summary only
   - tiny: compact list + selected summary/status line
2. Keep current scroll/follow controls working:
   - `tab`, arrows, `PgUp/PgDn`, `f`, `r`, `c`, `esc`, `^C`
3. Update render tests for exact width/height at minimum:
   - 62, 80, 95, 96, 120 columns
   - low terminal rows and normal terminal rows
   - empty queue, one running, many jobs, selected row near bottom
   - emoji/control/wide-char job labels and activity rows
   - writing-summary phase and long output/detail text
4. Add/adjust selector tests only when selector contract changes; keep selectors pure.
5. Reviewer pass checks spec compliance before code style.

Acceptance:
- render tests prove every line has exact visible width and frame height
- compact mode does not regress current stable fallback
- no overlay tearing/row leftovers under tested widths
- no new dependency, no `as any`, no ts-ignore/expect-error

### Slice 3: team-aware status line prototype

Owner/agent: status-line builder after core Sprint 2 body lands, or isolated parallel agent if preflight passes.
Ticket: `fdv-tm98`.
Skills: `kenzo-pi-flow-stack`, `kenzo-pi-extensions`, `kenzo-agent-preflight`.

Tasks:
1. Keep this additive to status selector; do not create TeamService in this ticket.
2. Add fixture-backed/team-state input path only if selector can remain pure and current flow status path stays unchanged.
3. Cover DESIGN/status examples:
   - `team review-loop · 4 agents · ctx:fresh · final-check · /flow`
   - `team fanout · 3 agents · ctx:pending · ckpt requested · /flow`
   - `team blocked:context · builder stale · open deck`
4. Use same truncation priority as `DESIGN.md`: `flow/team`, state/topology, blocked/final-check/checkpoint, `/flow`, then details.
5. If team data source is not present, selector remains in `flow`/`idle` mode; no speculative deck UI.

Acceptance:
- status-line v2 fixture tests pass for team states and existing flow states
- no noisy animation/feed duplication in status line
- no fake team rows appear in deck
- `fdv-tm98` can close or receive explicit follow-up blocker note

### Slice 4: team orchestration planning lane

Owner/agent: coordinator/planner.
Ticket: `fdv-1mnx`; later `fdv-y5gh`.
Skills: `kenzo-execution-preferences`, `kenzo-tk-cli`, `kenzo-blueprint-architect`, `kenzo-agent-preflight`, `pi-subagents` if delegation happens.

Tasks:
1. Keep `fdv-1mnx` as spec/planning lane while Sprint 2 layout executes.
2. Confirm team runtime boundary before implementation:
   - TypeBox schemas first
   - explicit preflight policy
   - context packet delivery state is queued/checkpoint unless control channel exists
   - verification policy defaults to final-only/changed-scope, not every worker running full suite
3. Decide whether `fdv-y5gh` should become Sprint 4 spec ticket after `prfdv-hyc2`, matching blueprint Sprint 4.
4. Do not let team runtime changes share a diff with hero overlay rendering unless only selector/test fixture data is touched.

Acceptance:
- team orchestration next step is implementation-ready or explicitly deferred
- no hidden autonomous branch mutation path
- no speculative child live-injection language in UI or docs

## Files / Areas

Implementation areas for next agents, not modified by this planning pass:

- `extensions/flow-system/src/deck/frame.ts` — frame/body layout math, wide/compact height split
- `extensions/flow-system/src/deck/columns.ts` — queue rail + activity body; likely split into pane render helpers
- `extensions/flow-system/src/deck/summary.ts` — selected detail/right pane rendering from `selectCoordinatorDetail`
- `extensions/flow-system/src/deck/header.ts` — top bar; keep calm chrome, no layout churn
- `extensions/flow-system/src/deck/footer.ts` — key hints/queue health; Sprint 3 owns deeper polish
- `extensions/flow-system/src/deck/index.ts` — overlay wiring, ticker, controller input, render dispatch
- `extensions/flow-system/src/deck/selectors.ts` — pure view models for queue rail, stream, detail, status line
- `extensions/flow-system/src/deck/layout.ts` — exact terminal-cell width helpers; avoid regression
- `extensions/flow-system/src/ui.ts` — status/HUD integration via compact selector
- `extensions/flow-system/src/types.ts` — only if `fdv-tm98` needs typed fixture/team status state; avoid queue contract drift
- `extensions/flow-system/test/deck-render.test.ts` — primary render acceptance
- `extensions/flow-system/test/deck-layout.test.ts` — cell width/control-byte safety
- `extensions/flow-system/test/deck-selectors.test.ts` — selector contracts
- `extensions/flow-system/test/status-line-v2.test.ts` — `fdv-tm98` fixtures
- `extensions/flow-system/test/ui.test.ts` — HUD/status integration
- `extensions/flow-system/test/errors.test.ts`, `executor.test.ts`, `status-tool.test.ts` — diagnostics regression checks if `fdv-6k8u` changes again

## Skills / Agents

Recommended routing:

- Coordinator/planner: `kenzo-execution-preferences`, `kenzo-tk-cli`, `kenzo-blueprint-architect`
- Hero overlay builder: `kenzo-pi-flow-stack`, `kenzo-pi-extensions`, `kenzo-bun`, `structured-return`
- Render safety reviewer: `kenzo-codex-review`, `kenzo-pi-flow-stack`
- Diagnostics debugger: `systematic-debugging`, `kenzo-backend-debugging`, `kenzo-pi-flow-stack`
- Status-line prototype builder: `kenzo-pi-flow-stack`, `kenzo-pi-extensions`
- Multi-agent/concurrent work: `kenzo-agent-preflight`, `pi-subagents`

Worktree rule:
- one active coding agent per live worktree
- if running Sprint 2 hero and status-line prototype concurrently, use separate worktrees or serialize
- do not put team-runtime implementation into the same patch as deck hero layout

## Verification

Baseline/implementation gates:

```bash
cd extensions/flow-system
bun run typecheck
bun test --timeout 15000
bun run build
```

Focused gates while iterating:

```bash
cd extensions/flow-system
bun test test/deck-render.test.ts test/deck-layout.test.ts test/deck-selectors.test.ts --timeout 15000
bun test test/status-line-v2.test.ts test/ui.test.ts --timeout 15000
bun test test/errors.test.ts test/executor.test.ts test/status-tool.test.ts --timeout 15000
```

Manual Sprint 2 gate after code lands:

1. Start long-running background flow.
2. Open `/flow manage`.
3. Verify wide deck shows queue rail + live activity + detail pane at same time.
4. Verify frame height stays stable while output streams and while `writing-summary` starts.
5. Verify selected row is unmistakable at top/middle/bottom of queue.
6. Verify compact widths do not wrap or leave stale cells.
7. Verify HUD/status suspends while overlay open and restores after close.
8. Verify status line remains quiet/compact and `/flow` hint survives truncation.

## Risks

- TUI width math regressions can reintroduce tearing; protect with exact-width tests before visual polish.
- Three-pane layout may squeeze content at 96 columns; use deterministic degrade threshold rather than cramped columns.
- Team-aware status states can imply nonexistent TeamService; keep fixture/API-gated and label pending/degraded only from data.
- Diagnostics retry may be blocked by external Anthropic quota; note blocker instead of stalling layout work.
- Header/footer polish can sprawl into Sprint 3; keep Sprint 2 focused on body hierarchy and frame stability.
- Multiple agents on same branch can overwrite deck files; require preflight/worktree isolation.

## Open questions

1. Wide threshold: keep current `width < 96` compact cutoff or raise if 3-pane content is too cramped?
2. Medium behavior: right detail as lower stacked section vs keyboard-toggled pane? Prefer smallest diff that preserves stable height.
3. Status team prototype input: use a pure selector fixture type only, or wait for `FlowTeamSession` schema ticket?
4. Diagnostics follow-up: is installed extension already updated with `fdv-6k8u` fix, or must user reinstall before runtime retry?
5. Should `prfdv-hyc2` get new child tickets for body layout and compact fallback, or keep slices under parent ticket notes?

## Anything missed / should review next

- Add tk notes linking this plan to `prfdv-hyc2`, `fdv-1mnx`, `fdv-6k8u`, and `fdv-tm98`.
- Before implementation, decide whether to create child tickets for Slice 1 and Slice 2 to keep reviews small.
- After Sprint 2 acceptance, move `prfdv-8c1g` into active queue for HUD/widget/control polish.
- Revisit `fdv-y5gh` only after `fdv-1mnx` confirms team schema/preflight/persistence boundaries.
- Keep `DESIGN.md` as source of visual truth; update blueprint only if implementation constraints force a design decision change.
