# Flow Deck v2 Blueprint

## Goal

Ship sharper `flow-system` overlay for supervising AI subagents in Pi.

Target outcome:
- visually closer to curated pro software than current utility layout
- clearer hierarchy: queue rail → selected subagent facts → live stream → summary/output
- stable overlay height during streaming
- lightweight enough for Bun/TUI redraws
- no heavy runtime deps or state-library addition

This file is sprint-0 source of truth for Flow Deck v2 implementation.

---

## Design direction from reference

Reference image establishes target product language.

Keep these traits:
- one strong hero overlay, not card soup
- selected subagent feels pinned and obvious
- queue reads like operators supervising autonomous workers
- live progress stream is first-class
- summary/output feels like payoff panel, not dump box
- palette calmer, more editorial, less rainbow widget chrome
- top and bottom bars anchor whole frame
- frame size stays stable while content streams

Retain from current product:
- terminal-native aesthetic
- keyboard-first controls
- explicit statuses: `pending`, `running`, `writing summary`, `done`, `failed`, `cancelled`
- low-overhead redraw model

Non-goals:
- changing queue execution semantics
- adding GUI/web UI
- adding persistent event journal
- adding heavyweight client state
- redesigning non-`flow-system` plugin surfaces

---

## Current architecture findings

### Strengths
- `queue.ts` already owns lifecycle truth.
- `progress.ts` already normalizes tool / assistant / summary-phase signals.
- `tool.ts`, `batch-tool.ts`, and `commands.ts` already centralize run lanes.
- `ui.ts` already separates compact HUD/widget from overlay deck.
- overlay HUD suspension already exists.

### Limits blocking v2
1. `FlowJob` fields are coarse snapshots, not stream history.
2. `deck/state.ts` feed is selected-job-only and resets on selection change.
3. `deck/index.ts` mixes queue subscription, local state, key handling, ticker, and render composition.
4. current render hierarchy reads like metadata+output, not mission control.
5. overlay has too many literal dividers and not enough structural pacing.

---

## Architecture decision

Use two layers.

1. **Execution truth layer** — existing `FlowQueueService`
   - still source of truth for job lifecycle
   - still owns persisted queue snapshot
   - queue schema stays lean

2. **Presentation layer** — new deck-local services
   - `FlowActivityJournalService` for bounded per-job activity history
   - `FlowDeckController` for overlay-local selection, focus, follow, scroll state
   - pure selector layer for derived hero view model

Do not make journal persistent in v2.

---

## Locked decisions from sprint 0

### Open question resolutions
1. **Journal scope**
   - overlay-first only in v2
   - may later power `flow_status`, but not in this pass

2. **Completed jobs in queue rail**
   - yes, retain compact summary preview row when cheap to derive
   - preview comes from output/error/assistant/progress fallback selector, not extra queue fields

3. **Layout choice**
   - yes, use true 3-region hero body:
     - left rail = queue
     - center = selected facts + live stream
     - right = summary/output

4. **Background completion in HUD**
   - keep current notify behavior
   - no extra pinned HUD strip in v2 first pass

### Spec constraints
- no theme reload on every render tick
- overlay height fixed while open
- stream and summary use fixed viewport heights
- only bounded journal retained in memory
- no extra deps
- no queue persistence contract changes

---

## Implementation contract

### New types

```ts
interface FlowActivityRow {
  ts: number;
  kind:
    | "progress"
    | "assistant"
    | "tool_start"
    | "tool_end"
    | "status"
    | "summary"
    | "system";
  text: string;
  label?: string;
  tone?: "default" | "muted" | "active" | "success" | "warning" | "error";
}

interface FlowDeckViewState {
  selectedId: string | undefined;
  panelFocus: "queue" | "stream" | "summary";
  streamScroll: number;
  summaryScroll: number;
  followMode: boolean;
  compact: boolean;
  snapshot: FlowQueue;
}
```

### Journal rules
- in-memory only
- extension-wide ephemeral service, created once in `extensions/flow-system/index.ts`
- injected from extension root into tool / batch / command / overlay registration just like `queue`
- keyed by `jobId`
- ring buffer size: `64` rows per job
- immutable append model
- dedupe consecutive identical normalized rows for same job
- append from explicit event producers, not by reconstructing whole history from queue snapshots
- accepted producers:
  - `tool.ts` progress path
  - `batch-tool.ts` progress path
  - `commands.ts` progress path
  - queue status transition observer inside journal service subscription
- deck opening must not backfill fake history beyond journal rows already captured; fallback selectors may still read current `FlowJob` snapshot for empty streams

### Journal event mapping
- `tool_start` → `kind: "tool_start"`, `label: toolName`, tone `active`
- `tool_end` → `kind: "tool_end"`, `label: toolName`, tone `success`
- `assistant_text` → `kind: "assistant"`, tone `default`
- `summary_state active=true` → `kind: "summary"`, text `Writing summary…`, tone `warning`
- `summary_state active=false` → no row unless needed to end stale summary phase
- status transitions:
  - `pending` → muted status row
  - `running` → active status row
  - `done` → success status row
  - `failed` → error status row
  - `cancelled` → muted status row
- stale restore normalization should append system/status row only if surfaced after restore

### Controller rules
- selected job defaults to first visible job
- if selected job disappears, clamp to first visible job
- `followMode` defaults true
- changing selection resets `streamScroll` and `summaryScroll` to `0`
- manual stream scroll disables `followMode`
- selecting another job re-enables `followMode`
- summary scroll never affects stream scroll
- `tab` cycles panel focus: `queue` → `stream` → `summary`
- focused pane owns arrow/page keys:
  - `queue`: `↑/↓` moves selection
  - `stream`: `↑/↓/PgUp/PgDn` scroll stream
  - `summary`: `↑/↓/PgUp/PgDn` scroll summary
- if focus is `queue`, stream follows live tail when `followMode=true`
- if focus is `stream` and user scrolls upward, disable `followMode`
- `f` toggles follow mode
- `r` forces render refresh only; no data mutation
- `c` cancels selected job
- `esc` and `^C` close overlay

### Selector rules
Selectors are pure. No side effects.

Required derived fields:
- queue counts by status
- selected job
- selected job summary preview
- selected job facts rows
- queue rail rows with title / subtitle / status / preview
- stream rows for selected job
- overlay footer status text
- compact HUD-compatible summary line reuse where useful

### Layout contract

Overlay regions:
1. **Top bar**
   - title + version-style badge + queue counts + workspace/mode/time
   - single stable line plus divider

2. **Body**
   - left rail: queue list
   - center top: selected subagent facts
   - center bottom: live progress stream
   - right: summary/output pane

3. **Bottom bar**
   - control hints left/center
   - system metrics/right hints if space allows
   - final status sentence on narrow widths

### Width behavior
- compact mode: `< 96`
  - stack as: header → selected facts → stream → summary → footer
  - queue rail collapses into short list section above facts
- wide mode: `>= 96`
  - 3-region layout
  - target split starting point:
    - left rail ~31%
    - center ~37%
    - right ~32%
  - exact widths can clamp for terminal width, but proportions should stay near this balance

### Height behavior
- overlay max height stable for session
- body viewport derived once per render from available height
- stream viewport fixed
- summary viewport fixed
- internal content scrolls, outer frame does not grow

### Queue rail content contract
Each row shows:
- ordinal / short id hint
- profile or agent label
- task title, max 2 wrapped lines in wide mode, 3 in compact stack mode
- model secondary line when available
- status at right edge
- duration or age at right edge secondary position
- tiny progress bar / recent activity glyphs only if cheap and width allows

Selected row must have:
- stronger border or prefix marker
- brighter title
- clear status emphasis

### Selected facts contract
Must show:
- model
- reasoning
- tools count
- started time
- running/duration
- task
- cwd basename or workspace hint if available

Writing summary state must show dedicated phase row.

### Stream contract
- append-only feel
- newest rows visible at bottom when `followMode=true`
- row format:
  - timestamp
  - small kind marker / label
  - text
- prefer stable single-line rows over wrapped paragraphs
- if text must truncate, truncate tail, not head
- empty stream message: muted `Waiting for activity…`

### Summary/output contract
Priority:
1. failed job -> `error`
2. done job -> `output`
3. cancelled job -> cancelled/error fallback
4. in-progress summary preview from `lastAssistantText`
5. fallback task text

Writing summary state:
- top indicator `IN PROGRESS` or equivalent
- partial preview allowed
- clear difference from final output

Done state:
- final output dominant

Failed state:
- error dominant

Cancelled state:
- cancelled reason or muted fallback

### HUD/widget alignment contract
- compact status text should reuse selector language where practical
- `writing-summary` wording identical across overlay and HUD
- no unrelated noise added to widget

---

## Module cut for implementation

Target structure for v2:

```text
extensions/flow-system/src/
  deck/
    journal.ts        FlowActivityJournalService
    controller.ts     state transitions + input handlers
    selectors.ts      pure derived view models
    index.ts          overlay bootstrap only
    header.ts         top bar
    columns.ts        wide/compact body composition shell
    summary.ts        summary pane render
    footer.ts         bottom controls/status
    layout.ts         width/height helpers
```

Exact responsibilities:
- `journal.ts`
  - create service
  - append event rows
  - subscribe/snapshot APIs
  - ring buffer cap
- `controller.ts`
  - state init
  - clamp selection
  - focus cycling
  - scroll movement
  - follow toggle
  - selection movement
  - sync on queue snapshot
- `selectors.ts`
  - queue counts
  - selected facts
  - queue rows
  - stream rows
  - summary content selection
- `index.ts`
  - queue + journal subscription wiring
  - ticker lifecycle
  - render dispatch
  - input event dispatch to controller
- `header.ts`, `columns.ts`, `summary.ts`, `footer.ts`
  - render only

Keep existing file names if diff stays smaller. New files allowed where separation clearly improves code.

---

## Sprint breakdown

### Sprint 0 — refine design direction and implementation spec
Deliverables:
- this blueprint tightened and locked
- ticket dependency chain set
- acceptance criteria per sprint written

Exit criteria:
- no unresolved questions blocking code
- exact module cut chosen
- keyboard model locked
- layout model locked

### Sprint 1 — lightweight activity journal + deck controller
Deliverables:
- `FlowActivityJournalService`
- controller state split from render loop
- selectors for queue/facts/stream/summary
- progress producers append normalized journal rows

Acceptance:
- switching selection does not destroy per-job stream history
- `writing summary` has dedicated journal rows
- queue persistence still works unchanged
- tests cover journal/controller behavior

### Sprint 2 — hero overlay + stable streaming layout
Deliverables:
- 3-region hero body in wide mode
- stacked compact mode
- fixed stream and summary viewports
- stronger selected row hierarchy
- calmer header/footer chrome

Acceptance:
- overlay height stable while streaming
- selected subagent obvious
- stream reads like true supervision log
- summary pane clearly distinct from stream
- render tests updated

### Sprint 3 — HUD/widget alignment + controls + review loop
Deliverables:
- selector reuse in HUD/status where appropriate
- `tab`, `f`, `r`, `c`, `esc`, `^C` control polish
- review cleanup and docs/help text updates if needed

Acceptance:
- overlay/HUD language aligned
- controls discoverable and quiet
- close/reopen behavior stable
- all tests/build pass
- manual flow run validation passes

---

## Sprint 0 closure note

Sprint 0 is complete when:
- journal ownership and injection seam are explicit
- layout and control model are explicit
- summary precedence is explicit
- ticket dependency chain is explicit

After those conditions are met:
- close `prfdv-ib5z`
- move `prfdv-nvju` to `in_progress`

---

## Verification gates

Run after each sprint:

```bash
cd extensions/flow-system
bunx tsc --noEmit
bun test --timeout 15000
bun run build
```

Manual lane after sprints 2 and 3:
- start long-running background flow
- open `/flow manage`
- verify fixed frame during streaming
- verify selected row is unmistakable
- verify `writing summary` state is explicit
- verify summary pane remains readable
- verify HUD suspends/restores cleanly

Review loop after each sprint:
1. spec compliance review
2. code quality review
3. ticket note with findings / follow-ups

---

## Implementation notes for next session or agent handoff

- branch: `feat/flow-deck-v2`
- worktree: `/home/kenzo/dev/pi-rig-flow-deck-v2`
- sprint order is strict: `prfdv-ib5z` → `prfdv-nvju` → `prfdv-hyc2` → `prfdv-8c1g`
- builder preference: `gpt-5.3-codex` when using flow builder lane
- reviewer preference: `gpt-5.4` `xhigh`
- do not start render rebuild before journal/controller layer lands
