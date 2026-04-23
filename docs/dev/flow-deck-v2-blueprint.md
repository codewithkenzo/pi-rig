# Flow Deck v2 Blueprint

## Goal

Ship a sharper, more professional `flow-system` overlay for supervising AI subagents in Pi.

Target outcome:
- visually closer to curated pro software than current utility layout
- clearer queue + selected subagent + live progress + summary hierarchy
- lightweight enough to keep Bun/TUI redraws stable
- minimal runtime overhead
- no heavy framework or state-library addition

This is a **spec-first** blueprint, not an implementation commit.

---

## Design direction from reference

Reference image direction worth preserving:
- single strong hero overlay, not a sheet of many tiny widgets
- selected subagent feels primary and obvious
- queue list reads like operators supervising autonomous workers
- live progress stream is treated as first-class, not just a sidebar note
- summary/output area feels like payoff panel
- palette is calmer, more curated, less rainbow-chip / dashboard-y
- more negative space and sharper rhythm than current layout

Retain from current product:
- terminal-native aesthetic
- keyboard-first controls
- lightweight streaming updates
- explicit status phases like `pending`, `running`, `writing summary`, `done`, `failed`, `cancelled`

---

## Non-goals

Not in first redesign pass:
- replacing queue execution model
- adding web UI or GUI toolkit
- introducing a heavyweight client-state layer
- making background jobs auto-resume an already-finished assistant turn
- persisting a full historical event journal across restarts
- redesigning unrelated plugin surfaces outside `flow-system`

---

## Current architecture findings

### Current strengths
- `queue.ts` already acts as lifecycle source of truth for job status.
- `executor.ts` now handles summary stabilization and final-answer completion better.
- `status-tool.ts` gives a strong inspection surface for background jobs.
- `ui.ts` already separates compact HUD/widget from overlay deck.
- overlay HUD suspension is already in place.

### Current limitations
1. **Overlay data model too thin**
   - `FlowJob` has only coarse fields: `lastProgress`, `lastAssistantText`, `recentTools`, `toolCount`, `output`, `error`.
   - this is enough for a utilitarian deck, but not enough for a premium “subagent supervision” UI.

2. **Feed model is local + lossy**
   - `deck/state.ts` derives a tiny append-only feed from the selected job only.
   - switching selection resets feed.
   - feed is reconstructed from a few snapshot fields, not a proper journal.

3. **Render loop and data model are tightly coupled**
   - `deck/index.ts` owns queue subscription, ticker lifecycle, selection state, and render state.
   - makes deeper UX improvements harder without tangling redraw logic.

4. **Current composition reflects implementation constraints more than product intent**
   - hierarchy reads as “metadata block + output block” instead of “subagent mission control”.
   - selected job detail and live stream are not rich enough to carry the premium design.

5. **Theme / layout feel too literal for target taste**
   - current deck can be good-looking, but reference suggests fewer boxes, stronger pacing, calmer color use, and clearer structural confidence.

---

## Architecture choice

Use a **lightweight two-layer view model**:

1. **Execution truth layer** — existing `FlowQueueService`
   - remains source of truth for lifecycle, envelope, output, errors, tool counts, completion state

2. **Deck presentation layer** — new lightweight in-memory journal/store
   - tracks richer per-job activity rows and overlay-local UI state
   - designed only for rendering and interaction
   - no heavy persistence requirement in first pass

This avoids a full rewrite while unlocking the richer design.

---

## Proposed data model additions

### 1. `FlowActivityJournalService` (new)

Purpose:
- keep a bounded, lightweight per-job stream of normalized activity rows for the overlay
- decouple live stream rendering from coarse `FlowJob` fields

Shape:
- in-memory only
- keyed by `jobId`
- bounded ring buffer per job, eg `64` or `96` rows max
- each row normalized to small immutable payload

Suggested row shape:

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
  label?: string;
  text: string;
  tone?: "default" | "muted" | "active" | "success" | "warning" | "error";
}
```

Why:
- queue remains lean
- overlay gains a real stream surface
- selected job can switch without losing visual continuity
- summary-writing phase can have better UX than one repeated line

### 2. `FlowDeckViewState` (replace/expand current deck state)

Suggested shape:

```ts
interface FlowDeckViewState {
  selectedId: string | undefined;
  leftScroll: number;
  rightScroll: number;
  panelFocus: "queue" | "stream" | "summary";
  followMode: boolean;
  compact: boolean;
  snapshot: FlowQueue;
}
```

Why:
- current single `scroll_offset` is too limiting for richer layout
- panel focus + follow mode are useful for premium operator UX

### 3. Optional lightweight derived snapshot

Add a selector layer (not necessarily persisted) for:
- queue counts by status
- selected job model
- active duration text
- primary/secondary rows for queue list
- summary preview text

This should be pure derived logic, not another source of truth.

---

## Proposed subsystem layout

Keep lightweight. Do **not** add a framework. Refactor into clearer modules.

Suggested structure:

```text
extensions/flow-system/src/
  deck/
    controller.ts      overlay-local state transitions + input handlers
    selectors.ts       derive hero view model from queue + journal
    journal.ts         FlowActivityJournalService (new)
    layout.ts          width/height math + fixed viewport rules
    render/
      frame.ts         shell / root frame
      queue-list.ts    left rail subagent list
      details.ts       selected subagent facts
      stream.ts        live progress stream
      summary.ts       summary / output pane
      footer.ts        controls + compact hints
```

Notes:
- existing files can be evolved instead of fully replaced if diff discipline matters
- but render responsibilities should become clearer than current `columns.ts` / `summary.ts` split

---

## UX model

### Primary mental model
User is not browsing generic jobs.
User is supervising a **fleet of subagents**.

### Core regions
1. **Queue / subagent rail**
   - compact list of agents
   - strong selected row
   - status + duration + small metadata hints

2. **Selected subagent facts**
   - model
   - reasoning
   - tool count
   - started / duration
   - task / workspace

3. **Live progress stream**
   - true append-only feel
   - tool actions + reasoning/progress/status rows
   - visually trustworthy and stable

4. **Summary / output**
   - partial while writing summary
   - full output after completion
   - clear distinction between in-progress and final

5. **Controls**
   - quiet but discoverable
   - keyboard-first only

### States to support cleanly
- empty
- single running subagent
- multi-subagent concurrency
- writing summary
- completed success
- failed / cancelled
- background completion surfaced outside overlay

---

## Layout principles

Derived from reference and current constraints:
- favor one strong hero overlay
- fewer nested boxes
- stronger section headers, calmer borders
- use spacing and alignment, not just separators, to create hierarchy
- selected row should feel like a pinned instrument panel item
- stream and summary regions should have fixed viewports to reduce redraw jitter
- overlay height should stay stable while open; do not let content growth change frame size every tick

---

## Color / icon direction

Use calmer, more editorial color discipline than current deck.

Guidelines:
- do not color every metric chip loudly
- use color semantically, not decoratively
- running: restrained cyan/blue
- writing summary: sharp violet/amber accent, subtle only
- done: mature green
- failed: controlled red
- pending: warm amber / muted gold
- metadata labels: dim
- values: bright neutral

Icons:
- keep plug-and-play with Nerd Font set if available
- preserve ASCII fallback structure
- selected row + status should still read without icon support

---

## Lightweight implementation rules

1. No new heavy runtime dependencies.
2. No large retained history; bounded journal only.
3. No theme reload on every render tick.
4. Keep render output height stable while overlay is open.
5. Centralize redraw triggers; avoid multiple competing `requestRender()` paths when possible.
6. Prefer pure selectors over ad hoc string assembly inside render functions.
7. Keep queue persistence unchanged unless absolutely required.

---

## Likely refactors needed

### Minimal required
- introduce activity journal for richer stream rows
- refactor overlay into controller + selectors + render sections
- split queue rail from selected detail from summary panel
- add fixed viewport logic for stream and summary panes
- stabilize redraw and follow-mode behavior

### Nice-to-have if cheap
- panel focus state
- follow toggle for live stream
- richer status line outside overlay using same selectors
- better “background job completed” summary strip in HUD

### Avoid in first pass
- generalized plugin-wide state bus
- fully persistent event logs
- fancy animations beyond spinner / subtle shimmer

---

## Suggested implementation phases

### Phase 0 — design capture
- lock reference direction
- define 1 hero state + 4 key states
- identify exact copy tone and icon language

### Phase 1 — data model exploration
- add `FlowActivityJournalService`
- wire progress events into journal alongside queue updates
- keep queue schema unchanged or minimally changed

### Phase 2 — overlay controller split
- move selection, panel focus, follow mode, scroll handling into controller layer
- separate render state from queue subscription wiring

### Phase 3 — hero layout rebuild
- implement queue rail
- implement selected subagent details header block
- implement dedicated live stream viewport
- implement summary/output viewport

### Phase 4 — polish + stability
- clamp viewport heights
- reduce redraw churn
- ensure overlay remains visually anchored during streaming
- fine-tune colors, spacing, and controls

### Phase 5 — compact HUD alignment
- reuse selectors for status/widget strip
- keep overlay and HUD language consistent

---

## Verification gates

Required after each major phase:

```bash
cd extensions/flow-system
bunx tsc --noEmit
bun test --timeout 15000
bun run build
```

Manual validation:
- start long-running background flow
- open `/flow manage`
- verify overlay remains stable while streaming
- verify selected row is obvious
- verify writing-summary state reads clearly
- verify summary/output panel remains usable
- verify close/reopen does not regress HUD behavior

---

## Open questions

1. Should the activity journal stay overlay-only, or also power `flow_status` previews later?
2. Should completed jobs retain a richer summary preview row in queue rail?
3. Is a 3-pane hero layout better than current 2-pane composition for the chosen design?
4. Should background completion toasts also pin a short-lived completion strip in HUD?

---

## Research lane

Repo facts are currently enough for initial spec.
Use Exa / Context7 only if implementation hits unknowns around:
- pi overlay/custom rendering API limits
- terminal repaint / animation best practices
- portability constraints in `@mariozechner/pi-coding-agent`

---

## Recommended next step

Before code:
1. generate 2–3 higher-taste hero mock variants using the new prompt
2. choose one direction
3. turn this blueprint into a smaller implementation spec with exact module cuts
4. only then start refactor
