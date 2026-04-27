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

Visual asset manifest:
- `docs/media/design/flow-deck-v2/PROMPTS.md`

Known prior generated reference:
- `/tmp/clipboard-images/clip_20260423_042821.png` (mentioned in sprint 0 notes; currently not present after restart)

When recovered or regenerated, save images under `docs/media/design/flow-deck-v2/` and keep this blueprint as the behavior/layout source of truth.

Keep these traits:

### Mock direction notes

Design source now exists at repo/worktree root: `DESIGN.md`. It is the visual source of truth for Flow Deck v2 implementation after mock selection.

Current mock direction is acceptable, with constraints:
- use the mission-control mock as the closest base: less theatrical, more implementable
- keep only one main Flow Deck screen plus one status-line treatment; avoid adding more UX screens before `DESIGN.md`
- status line must integrate as an appendable/replaceable segment beside existing Pi status providers, not own the whole footer
- design details must map to confirmed Pi/Flow sources: queue/job state, activity journal, team/session service, context packets, hook events, sidecar artifact indexes, `ctx.ui.custom`, `ctx.ui.setStatus`/`setWidget`
- anything not backed by an API should be removed, softened, or labeled future/queued/checkpoint

### Design lock workflow

Use design-to-code lane in this order:
1. generate mocks from `docs/media/design/flow-deck-v2/PROMPTS.md`
2. choose one main direction plus one status-line direction
3. create repo/worktree `DESIGN.md` as design source of truth for implementation ✅
4. map `DESIGN.md` tokens → deck render tokens → selectors/components
5. only then implement layout-heavy v2 changes

DESIGN.md should capture:
- terminal grid, panel ratios, spacing rhythm, row heights, footer/header heights
- palette tokens: ink/charcoal base, violet/blue/cyan primary accent, amber warning, green success, red error, muted chrome text/borders
- typography: terminal mono first, tabular numerals for metrics, clear truncation rules
- component recipes: top bar, team rail, selected agent row, event row, context packet chip, handoff card, status line segment
- interaction states: focus, selected, stale context, pending injection, blocked, checkpoint requested, final verification pending
- accessibility/performance: contrast, reduced motion, ASCII fallback, stable width, no redraw thrash

Design taste constraints:
- premium command-center/control-panel, not generic SaaS dashboard
- high signal density with deliberate hierarchy, not card soup
- subtle glow/depth only to clarify focus/state
- one main screen with paged/toggleable detail; no modal maze
- status line must look sleek, compact, and quiet by default

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

## Current API/data wiring evidence

This section grounds v2 in current Pi/Flow APIs. Do not implement from imagined capabilities without updating this section.

### Pi ExtensionAPI facts currently used

Source: `kenzo-pi-extensions` skill + current `extensions/flow-system/index.ts`.

Available/used surfaces:
- `pi.registerTool(...)` with TypeBox parameters and Promise `execute(toolCallId, params, signal, onUpdate, ctx)`
- `pi.registerCommand(...)` for `/flow` command surface
- shortcut registration via existing command wiring
- lifecycle events: `session_start`, `agent_end`, `session_shutdown`, `resources_discover`
- custom session persistence via `pi.appendEntry(FLOW_ENTRY_TYPE, ...)` and `ctx.sessionManager.getEntries()`
- UI notification/status/deck overlay through `ctx.ui` and current `attachFlowUi(...)`
- `resources_discover` can expose skill paths for Pi to load/discover extension skills

Important constraints and newly confirmed docs:
- no confirmed in-process subagent API; Flow currently spawns `pi` subprocesses in JSON mode
- Pi extension docs confirm main-session steering APIs: `pi.sendMessage(...)` and `pi.sendUserMessage(..., { deliverAs: "steer" | "followUp" | "nextTurn" })`
- those steering APIs apply to the active Pi session, not automatically to child subprocess sessions; do not design child-live injection unless child control channel is implemented/proven
- `before_agent_start` can modify system prompt before a main-session agent run; `context` can modify messages before each LLM call; `tool_call` can mutate/block tool inputs; `tool_result` can modify results
- `ctx.ui.setStatus` / `ctx.ui.setWidget` are supported, so Flow status line should append/integrate as current code does and avoid taking over other status providers
- no confirmed hard Pi-core `maxTurns`/`maxToolCalls` runtime cap in installed surface; treat `maxIterations` as advisory prompt/CLI metadata until verified
- tool-call counting is Flow-observed from streamed JSON events or Pi tool events, not a core-enforced turn budget
- transcript/session path access should remain read-only and optional until a public API is confirmed

### Current Flow execution path

Current path:
1. `flow_run` / `flow_batch` TypeBox schemas accept profile/task/cwd/background/model/provider/reasoning/effort/maxIterations/preload
2. `resolveExecutionEnvelope(...)` normalizes model/provider/reasoning/maxIterations/preload
3. `collectExecutionPreloadPrompt(...)` reads bounded files/dirs/commands and builds prompt digest
4. `executeFlow(...)` stages profile skills with `Effect.acquireUseRelease(...)` when `profile.skills.length > 0`
5. `runSubprocess(...)` spawns `pi --mode json -p --no-session` with `--thinking`, model/provider, `--tools`, `--append-system-prompt`, optional `--system-prompt`
6. stdout JSON lines are parsed for message text/progress/tool events; stderr is capped
7. queue status updates drive HUD/deck/status; activity journal appends bounded rows
8. session lifecycle persists queue snapshots, restores stale active jobs as failed

Existing reliability primitives:
- `AbortController` is bound to queue cancel via `queue.bindAbort(...)`
- subprocess cleanup kills child on interruption/cancel
- watchdogs exist for stream idle, summary idle, summary finalize grace
- output is capped (`MAX_OUTPUT_BYTES`) and queue history pruned (`MAX_JOBS`)
- activity journal is bounded (`64` rows/job) and dedupes consecutive identical rows
- progress tracker throttles assistant text (`ASSISTANT_TEXT_THROTTLE_MS`)

### Pi-docs-supported hooks to use before inventing more

Public docs support these hook points and should shape implementation:
- `before_agent_start`: inspect loaded skills/context/system prompt and append team-run guardrails for the main coordinator turn
- `context`: inject or prune compact messages before each LLM call in the main session; useful for coordinator reminders and pending packet summaries
- `tool_call`: block/mutate unsafe or underspecified calls; enforce required team-run fields and branch/worktree policy
- `tool_result`: compact/reshape noisy tool outputs into packet/handoff-friendly results
- `turn_start` / `turn_end`: observe main-session turns for budget, checkpoint, and synthesis timing
- `message_update` / `message_end`: observe streaming text if needed, but do not do heavy work here
- `tool_execution_start/update/end`: count tool events and update lightweight status/journal state
- `input`: optional nudge/transform only; do not surprise users with hidden routing
- `resources_discover`: expose Flow skills/prompts; later may expose team role skills/prompts
- `session_before_compact` / `session_compact`: future lane for custom compaction/summaries, not v2 first pass unless needed

Practical consequence:
- Main/coordinator context injection is docs-supported via events and `sendMessage`/`sendUserMessage`.
- Child-flow live injection is not yet docs-supported; v2 should model child updates as queued packets/checkpoints unless a child control channel is added.

### Data model implications for v2

Do not replace queue truth. Extend around it:
- `FlowQueueService` remains lifecycle source: enqueue, status, cancel, snapshot/restore
- `FlowActivityJournalService` remains ephemeral stream/journal source
- Team/session state should be a separate service layered above jobs, not stuffed into every `FlowJob` field
- Team sidecars may store larger packet/handoff/history JSONL, but Deck must consume compact selectors only
- final queue snapshot can store compact output/error/toolCount/envelope; long artifacts live by path/digest

### Implementation guardrails

- Keep TypeBox schemas explicit with `additionalProperties: false` for new API inputs
- derive TypeScript types via `Static<typeof Schema>`
- validate config/session/custom entries with `Value.Check`
- keep Effect internals at boundaries: `Effect.runPromise` / `Effect.runPromiseExit` only from Pi Promise APIs
- keep tagged errors Bun-safe: no trailing `()` on `Data.TaggedError` classes
- use `Ref.modify` for atomic queue/team-state transitions; avoid read-then-write races
- use `Effect.acquireUseRelease` for temp skill/context files and subprocess resources
- cap all retained strings/arrays and avoid full transcript scans during redraw
- prefer pure selectors for Deck/status view models

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
- coordinator/detail sections from real `FlowJob` + `FlowActivityJournal` data only
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
  - small tone marker
  - uppercase taxonomy chip
  - source/job label
  - detail text
- taxonomy maps only current data sources:
  - `tool_start` → `TOOL CALL`
  - `tool_end` → `TOOL RESULT`
  - `assistant` → `MESSAGE`
  - `summary` → `SUMMARY`
  - `progress` / `status` / `system` → `STATUS`, `WARNING`, or `INFO` from row tone
  - `system` rows labeled `budget` → `WARNING`
- optional `AGENT STARTED` row may render only from selected `FlowJob.startedAt` and real job status
- prefer stable single-line rows over wrapped paragraphs
- if text must truncate, truncate tail, not head
- empty stream message: muted `Waiting for activity…`

### Summary/detail contract
Right/detail panel title should stay close to `DETAIL / SELECTED FLOW` or `COORDINATOR TRUTH / DETAIL` while remaining API-gated.

Allowed sections from current Flow data:
- `CURRENT STATE`: status/profile/task/model/reasoning/tool count/budget/timestamps from selected `FlowJob`
- `RECENT SIGNALS / NOTES`: last bounded journal rows plus real `lastProgress`, `lastAssistantText`, and `recentTools`
- `OUTPUT / SUMMARY`: selected text using summary/output priority below
- `BUDGET / VERIFICATION`: real envelope budget fields and terminal job status only; no fake lint/test/schema states

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

## Pi plugin ecosystem inputs for feature lock

Source: recent Pi session transcript in `~/.pi/agent/sessions/--home-kenzo-dev-pi-plugins-repo-kenzo-.dmux-worktrees-dmux-1777009913426-opus47--/2026-04-24T05-51-54-401Z_019dbe0b-7221-764d-9e2c-487b3f2d79bb.jsonl`, especially the flow-generated `docs/architecture/pi-edit-ecosystem-compare.md` in Claude's spec worktree.

Public Pi/pi-agent surfaces found there:
- Pi core `edit` / `write`: exact text replace, full write, no rollback.
- `@yofriadi/pi-ast`: AST search/rewrite with dry-run/apply.
- `@yofriadi/pi-hashline-edit`: hash-addressed line edits.
- `@yofriadi/pi-review`: compact review/verdict capture.
- `pi-diff-review`: native diff review window and feedback prompt.
- `pi-rewind-hook`: automatic checkpoints and restore via branch flow.
- `pi-rewind`: checkpoint browser, diff preview, safe restore, redo stack.

Flow-system relevance:
1. Flow Deck v2 should focus on subagent/job orchestration, not primary edit/rollback semantics.
2. If pi-edit/pi-diff/pi-rewind style plugins are installed, Flow Deck can surface their artifacts as job outputs: diff, checkpoint, review verdict, patch summary.
3. Flow status line should show flow health, not duplicate edit plugin UI.
4. Plugin integration should be adapter/event based; every plugin must still work standalone.
5. Advanced team/context/hook features must be Pi-agent-native and ExtensionAPI-backed, not copied from non-Pi tools.
6. UI implementation is not complete until it accounts for this Pi plugin ecosystem: edit artifacts, review verdicts, rewind checkpoints, dry-run/apply distinctions, rollback availability, and standalone-install degradation.

Open Pi-native research still needed:
- exact current Pi core support for hard max agent iterations at runtime
- current ExtensionAPI/session events available for hook-like lifecycle behavior
- whether Pi has or should have a shared status-line aggregation surface
- whether flow jobs can expose transcript/artifact paths without depending on private session internals

---

## Team orchestration expansion track

Flow Deck v2 should leave room for a stronger coordination model beyond simple background concurrency.

Target product feel: Pi as lead operator supervising a small agent team, closer to modern subagent-team workflows than a plain job list.

### Core concepts

1. **Coordinator session**
   - one main agent owns the mission plan and synthesis
   - subagents are workers/reviewers/researchers, not peers editing randomly
   - coordinator can pause, spawn, hand off, request review, or close loops
   - optional delegate mode keeps coordinator coordination-only: no code edits unless user exits delegate mode
   - coordinator owns final synthesis, acceptance, and ticket notes

2. **Team topology**
   - `fanout`: multiple agents explore/implement independent slices
   - `chain`: agent A output becomes agent B input
   - `review-loop`: builder → reviewer → builder patch cycle
   - `debate`: two agents compare approaches, coordinator chooses
   - `handoff`: one agent packages context for another to continue
   - `supervision`: one reviewer watches active jobs and flags drift
   - `plan-approve`: worker explores read-only, coordinator/user approves mutation
   - `schema-fanout`: many row-like tasks run with fixed output schema and aggregate result

3. **Agent-to-agent communication**
   - not freeform chat spam
   - structured handoff notes, review findings, blockers, decisions
   - surfaced as deck events with source/target labels
   - direct messages preferred over broadcasts when target is known
   - approval/blocker events must identify source job/thread
   - persisted only when explicitly promoted to ticket/doc/session summary

4. **Transcript and artifact lane**
   - surface transcript path/session id per job when available
   - retain final assistant message and structured summary in queue snapshot
   - allow deck summary pane to show job output, team synthesis, artifacts, or transcript metadata
   - future artifact types: diff, screenshot, log, generated file, CSV/JSON fanout result
   - transcript parsing is read-only and opt-in; no hidden transcript mutation

5. **Context injection lanes**
   - preload repo docs, tk ticket, relevant skills, specs, changed files
   - inject per-agent scoped context, not one giant shared prompt
   - support `context packs`: `spec`, `code-slice`, `review`, `release`, `debug`
   - show context freshness in deck/status line: `fresh`, `stale`, `missing`, `hooked`

6. **Hooks and policy gates**
   - pre-run hooks: ticket check, branch/worktree safety, skill load, context pack assembly
   - mid-run hooks: progress normalization, blocker detection, output compaction
   - post-run hooks: summary extraction, tk note proposal, verification command proposal
   - team hooks: teammate idle reassignment, task completion gate, review required, plan approval before mutation
   - hook scopes: user, project, profile, agent, file-format, plugin capability
   - hook outputs may allow, block, inject context, mark degraded, or request follow-up
   - hooks must be explicit and observable; no hidden magic altering code

7. **Dynamic prompting / flow techniques**
   - profile prompt may be composed from mission + topology + context pack + role
   - coordinator can choose `explore`, `build`, `review`, `debug`, `research`, `synthesize`
   - future profiles may define chain templates instead of only single-agent runs
   - no autonomous branch mutation unless coordinator/owner allows it

8. **Agent-first team run selection**
   - user should not need to memorize `/chain`, `/parallel`, or `/team` commands
   - coordinator/main agent can infer best topology from ticket + spec + repo state
   - explicit tool input still exists for power users and tests, but normal UX is: user creates/points at ticket/spec → agent chooses topology → deck supervises
   - topology choice must be explainable in one sentence before launch
   - unsafe choices still require confirmation: mutation, shared worktree edits, destructive commands, secrets, network-sensitive work

9. **Budget and hurry-up policy**
   - current Pi runtime evidence does not prove a hard `maxTurns` / `maxToolCalls` API exposed to extensions
   - Flow can still count observed tool events from streamed JSON/progress and enforce or warn on its own budget
   - prefer soft runtime budgets first: when elapsed time crosses `warnAfterSeconds`, inject/request a checkpoint summary instead of immediately killing useful work
   - hard stop remains available for runaway protection: explicit cancel/abort, process kill, or cap-exceeded failure when configured
   - budget labels must be clear: `advisory`, `soft-warning`, `hard-cap`

10. **Main-agent guardrails**
   - assume main agents may forget team tools, skills, tickets, memory, context packets, or background-first behavior
   - extension should make the correct path the easy path through schemas, defaults, required fields, and hooks
   - team tools should reject underspecified launches unless they include or can derive: ticket/spec, topology, role plan, cwd/worktree policy, skills/context packs, budget policy, verification policy
   - prefer agent-facing nudges and structured errors over hidden magic: “team run needs ticket/spec or explicit reason”, “builder role needs worktree policy”, “review-loop needs final verification policy”
   - if main agent calls single `flow_run` for multi-agent work, prompt/tool result may suggest `team_run` with inferred topology instead of silently accepting bad orchestration

11. **Skills, memory, tickets, and spawn curation**
   - skills are first-class context packs, not incidental prompt text
   - spawned sessions should receive curated skills by role/topology: scout gets repo/search skills, builder gets stack skills, reviewer gets review/testing skills, coordinator gets orchestration/tk skills
   - support mandatory/auto-derived spawn fields: `ticketId`, `specPath`, `cwd`, `branchPolicy`, `role`, `skills`, `contextPacks`, `budget`, `verificationPolicy`
   - ticket assignment should be explicit: coordinator owns ticket note/synthesis; workers can attach handoffs/artifacts but do not silently close tickets
   - memory injection must be bounded and ranked: prefer tk notes + local docs + explicit memory hits; never dump broad memory into every subagent
   - profile/team config can define required skills and forbidden skills/toolsets per role

12. **Efficiency and verification policy**
   - do not let every worker independently run full typecheck/test/build unless role requires it
   - team run should own a `verificationPolicy`: `none`, `per-agent-light`, `final-only`, `changed-scope`, `ci-handled`
   - default for multi-agent coding: workers summarize and stop; coordinator/Flow runs one final structured verification pack after synthesis
   - verification pack can run programmatically via extension/structured-return lane, then inject result as `test-result` packet
   - workers may run cheap local checks only when scoped and budgeted; full repo checks are final-gate by default
   - avoid repeated GitHub/CI workflows from each subagent; CI trigger belongs to coordinator/final gate only

13. **Performance envelope**
   - dynamic context must not become a CPU/RAM/TUI tax
   - use bounded ring buffers, debounce/coalesce stream events, lazy-read sidecar artifacts, cache skills/context packs by mtime/hash, and cap packet history per team/job
   - Effect should model resource safety: scoped subprocess lifecycle, interruption, timeouts, backpressure, bounded queues, retry policy, and typed failure causes
   - TUI should render derived compact view models only; no full transcript scans during redraw
   - context assembly should happen at launch/checkpoint boundaries, not every stream tick
   - if system load is high, degrade gracefully: pause noncritical polling, lower redraw fps, skip optional packet ranking, show `degraded` state

### Context packet contract

Context packets are the backstage API for team runs. They are small, typed updates that coordinator/main agent can route to one worker, a lane, or the whole team without dumping full logs into every context window.

Principles:
- packets are **bounded** and token-efficient; default target is one agent, not broadcast
- packets are append-only session events until explicitly promoted to tk/docs/final summary
- subagents can propose packets; coordinator decides which become accepted team truth
- every packet has provenance: source job/session, created time, reason, optional artifact path
- packet body should be compact markdown or structured JSON, never raw transcript spam
- sidecar/session files may store full packet history as JSONL; deck reads summaries/indexes only so TUI stays fast

```ts
type FlowContextPacketKind =
  | "decision"
  | "constraint"
  | "finding"
  | "risk"
  | "artifact"
  | "test-result"
  | "handoff"
  | "blocker"
  | "correction"
  | "budget-warning";

type FlowContextTarget =
  | { type: "agent"; jobId: string }
  | { type: "role"; role: "scout" | "planner" | "builder" | "reviewer" | "researcher" | "verifier" }
  | { type: "team"; teamId: string };

interface FlowContextPacket {
  id: string;
  teamId: string;
  ts: number;
  kind: FlowContextPacketKind;
  source: "coordinator" | "agent" | "hook" | "user" | "system";
  sourceJobId?: string;
  target: FlowContextTarget;
  priority: "low" | "normal" | "high" | "urgent";
  title: string;
  summary: string;
  body?: string;
  artifactPath?: string;
  tokenEstimate?: number;
  expiresAt?: number;
  status: "proposed" | "accepted" | "injected" | "superseded" | "rejected";
}
```

Injection API shape, future surface:

```ts
interface TeamInjectInput {
  teamId: string;
  packet: Omit<FlowContextPacket, "id" | "ts" | "status">;
  delivery: "now" | "next-turn" | "checkpoint";
  requireAck?: boolean;
}
```

Delivery rules:
- `now`: send as immediate coordinator instruction if target process supports live stdin/control; otherwise queue for next checkpoint
- `next-turn`: prepend to next subagent prompt/resume call
- `checkpoint`: request subagent summary first, then inject compact correction/context
- if Pi core lacks live injection API, Flow stores queued packets and surfaces `pending injection` in Deck/status line

### Structured handoff contract

Team runs should return more than a prose summary. Each agent final output should include a compact structured handoff, then coordinator synthesizes team-level result.

```ts
interface FlowAgentHandoff {
  jobId: string;
  role: string;
  status: "done" | "blocked" | "failed" | "cancelled";
  objective: string;
  keyFindings: string[];
  decisionsProposed: string[];
  filesRead: string[];
  filesChanged: string[];
  commandsRun: string[];
  artifacts: Array<{ kind: string; path?: string; summary: string }>;
  risks: string[];
  nextActions: string[];
  tokenEfficientSummary: string;
}

interface FlowTeamSynthesis {
  teamId: string;
  topology: FlowTeamSession["topology"];
  result: "ready" | "needs-review" | "blocked" | "failed";
  acceptedFacts: string[];
  rejectedAssumptions: string[];
  decisions: string[];
  outstandingQuestions: string[];
  agentHandoffs: FlowAgentHandoff[];
  recommendedNextStep: string;
}
```

TUI rule: Deck shows concise synthesis + artifact indexes. Full JSONL/markdown sidecar can be opened on demand; do not render full payload every tick.

### Hook design for team runs

Hooks compensate for main-agent forgetfulness and keep orchestration cheap/reliable. They are extension-visible policy points, not hidden autonomous behavior.

Recommended hook phases:
- `preflight`: ticket/spec/worktree/branch/safety check before spawning
- `spawn-curate`: choose role prompt, skills, context packs, memory snippets, cwd, budget, and verification policy
- `progress`: normalize stream events, count tools, detect blockers/drift/budget warnings
- `checkpoint`: request compact handoff when runtime/tool budget crosses soft threshold or context becomes stale
- `synthesis`: merge agent handoffs into team truth and produce coordinator summary
- `verification`: run final verification pack once according to `verificationPolicy`
- `postrun`: propose tk note/doc update and persist sidecar artifacts

Hook outputs:
- `allow`
- `block` with reason
- `warn`
- `injectPacket`
- `requireField`
- `recommendTopology`
- `setSkills`
- `setVerificationPolicy`
- `degrade`

Hooks must be observable in Deck as compact events (`hook:spawn-curate set 4 skills`, `hook:verification final-only`).

### Deck representation for team mode

Add optional team/session layer above jobs:

```ts
interface FlowTeamSession {
  id: string;
  title: string;
  coordinator: string;
  topology:
    | "fanout"
    | "chain"
    | "review-loop"
    | "debate"
    | "handoff"
    | "supervision"
    | "plan-approve"
    | "schema-fanout";
  status: "planning" | "running" | "blocked" | "synthesizing" | "done" | "failed";
  jobIds: string[];
  contextState: "fresh" | "stale" | "missing" | "hooked" | "error";
  delegateMode: boolean;
  qualityGates: string[];
}

interface FlowTeamEvent {
  ts: number;
  teamId: string;
  sourceJobId?: string;
  targetJobId?: string;
  kind:
    | "message"
    | "handoff"
    | "review"
    | "blocker"
    | "approval_request"
    | "approval_result"
    | "context_injected"
    | "gate_passed"
    | "gate_failed"
    | "artifact";
  text: string;
  artifactPath?: string;
}
```


Deck additions when team mode exists:
- left rail can group jobs by team session
- center facts show coordinator, topology, context pack, current phase
- stream includes structured agent-to-agent events
- summary pane can toggle selected job output vs team synthesis
- footer exposes controls: `handoff`, `review`, `synthesize`, `open ticket` when supported

### Proposed v2 services and wiring

Keep implementation modular and testable. Names are provisional, but boundaries should hold.

```ts
interface FlowTeamService {
  create(input: TeamRunInput): Effect.Effect<FlowTeamSession, TeamValidationError>;
  attachJob(teamId: string, jobId: string, role: FlowTeamRole): Effect.Effect<void, TeamNotFoundError>;
  appendEvent(event: FlowTeamEventInput): Effect.Effect<void, TeamNotFoundError>;
  applyPacket(packet: FlowContextPacketInput): Effect.Effect<FlowContextPacket, TeamNotFoundError | TeamPolicyError>;
  setStatus(teamId: string, status: FlowTeamSession["status"]): Effect.Effect<void, TeamNotFoundError>;
  snapshot(): Effect.Effect<FlowTeamSnapshot>;
  subscribe(listener: (snapshot: FlowTeamSnapshot) => void): () => void;
}

interface FlowHookService {
  runPreflight(input: TeamRunInput): Effect.Effect<HookDecision[], HookError>;
  curateSpawn(input: SpawnCurationInput): Effect.Effect<SpawnCurationResult, HookError>;
  onProgress(input: TeamProgressInput): Effect.Effect<HookDecision[], never>;
  requestCheckpoint(input: CheckpointInput): Effect.Effect<FlowContextPacketInput, HookError>;
  synthesize(input: SynthesisInput): Effect.Effect<FlowTeamSynthesis, HookError>;
  verify(input: VerificationPackInput): Effect.Effect<VerificationResult, HookError>;
}
```

Wiring order for a future `team_run`:
1. validate `TeamRunInput` with TypeBox
2. run preflight hooks: ticket/spec/cwd/worktree/budget/verification policy
3. infer topology if omitted; return rationale in tool result/update
4. spawn-curate each role: skills, context packs, memory snippets, toolsets, cwd, model/provider
5. create team session
6. enqueue underlying `flow_run` jobs with generated prompts and shared `teamId` metadata
7. journal progress into both job activity rows and team events
8. apply budget/progress hooks; request checkpoint packets at soft thresholds
9. collect structured handoffs
10. run one final verification pack by policy
11. synthesize team output and propose tk/doc updates

Compatibility rule: simple `flow_run` and `flow_batch` must keep current behavior. Team mode is additive and can be hidden behind explicit tool/API flag until stable.

### TypeBox schema requirements for future APIs

Define schemas before implementation for:
- `TeamRunInputSchema`
- `FlowTeamSessionSchema`
- `FlowTeamEventSchema`
- `FlowContextPacketSchema`
- `FlowAgentHandoffSchema`
- `FlowTeamSynthesisSchema`
- `FlowBudgetPolicySchema`
- `FlowVerificationPolicySchema`
- `FlowHookDecisionSchema`

All new tool schemas must reject unknown fields (`additionalProperties: false`) and cap array/string sizes.

### Team-mode non-goals for first v2 pass

- no autonomous multi-agent planner mutating branches without user intent
- no persistent message bus
- no hidden prompt rewriting
- no cross-worktree edits by multiple agents to same files
- no web dashboard

### Team-mode acceptance before implementation

Before implementing this expansion:
- write explicit TypeBox schemas for team sessions/events/context packs/hooks/artifacts
- define how team state is created from `flow_run`/`flow_batch`/future commands
- decide persistence boundary: session snapshot vs durable docs/tk notes
- define hook ordering and failure behavior
- verify Pi runtime hard-cap support for max iterations; if absent, keep `maxIterations` as advisory and implement Flow-side observed tool-count/runtime budgets
- define budget behavior separately for soft warning vs hard cancel
- add tests proving dynamic prompt composition is deterministic
- add tests for delegate mode, plan approval, and quality-gate state transitions

---

## Status line v2 companion contract

This section is the status-line source of truth for Flow Deck v2. Do not create parallel flow/status specs unless status line becomes a separate package.

## Goal

Make the compact Pi status line a useful mission-control surface for `flow-system`, not a noisy ticker.

It should answer, at a glance:
- what is running
- whether agents are blocked, summarizing, failed, or waiting
- whether team/orchestration mode is active
- whether context injection/hooks are affecting current work
- what key action opens deeper supervision (`/flow`, deck, logs)

## Relationship to Flow Deck v2

Status line is the peripheral surface. Flow Deck is the inspection surface.

Rules:
- status line summarizes; deck explains
- status line never duplicates full feed/output
- status line uses same selectors/language as deck where possible
- status line must remain stable during streaming; no width thrash
- status line must never reintroduce overlay tearing/dragging behavior

## v2 status line modes

### 1. Quiet idle

When no flow work exists:
- minimal indicator or hidden state
- no fake productivity text
- no stale job names

Example:

```text
flow idle · /flow
```

### 2. Single active agent

Show:
- profile/agent label
- status (`running`, `writing-summary`, `done`, `failed`)
- short task hint
- elapsed time
- compact activity pulse

Example:

```text
flow coder running · deck layout pass · 02:14 · /flow
```

### 3. Multi-agent queue

Show counts and dominant phase:
- running/pending/done/failed counts
- primary selected or newest running job
- summary phase count if any

Example:

```text
flow 2 running · 1 pending · 1 writing-summary · /flow
```

### 4. Team orchestration mode

When team sessions are active, show team-level state without becoming noisy:
- coordinator/profile label only if useful
- active topology (`fanout`, `chain`, `review-loop`, `debate`, `handoff`)
- agent count and dominant gate (`review`, `checkpoint`, `verify`, `blocked`)
- context freshness: `ctx:fresh`, `ctx:stale`, `ctx:pending`, `ctx:hooked`
- budget hint only when meaningful: `warn 12m`, `42/80 tools`, `ckpt`
- one compact hook/verification signal when active: `hooks`, `final-check`, `ci`

Examples:

```text
team review-loop · 4 agents · ctx:fresh · final-check · /flow
team fanout · 3 agents · ctx:pending · ckpt requested · /flow
team blocked:context · builder stale · open deck
```

### 5. Degraded or blocked

Show failure explicitly but compactly:
- failed count
- blocked reason class when known: `tool`, `merge`, `timeout`, `context`, `model`
- action hint

Example:

```text
flow blocked:model · 1 failed · open deck
```

## Selector contract

Status line should consume a compact selector, not inspect raw queue everywhere.

Required derived fields:
- `mode`: `idle | single | queue | team | degraded`
- `label`: primary compact text
- `phase`: dominant state
- `counts`: pending/running/summary/done/failed/cancelled
- `primaryJobId?`
- `primaryTask?`
- `teamTopology?`
- `contextState?`: `none | fresh | preloaded | hooked | pending | stale | error`
- `budgetState?`: `none | advisory | soft-warning | hard-cap | checkpoint-requested`
- `hookState?`: `none | active | degraded | blocked`
- `verificationState?`: `none | pending | running | passed | failed | ci-handled`
- `actionHint`: usually `/flow`
- `tone`: `muted | active | success | warning | error`

## Render rules

- clamp to available terminal width
- prefer stable segments over animated text
- one subtle pulse max for active work
- do not show raw stack traces or long output
- never wrap line
- truncate middle/secondary segments first, keep phase/counts visible
- reduce motion when `NO_COLOR`, ASCII mode, or reduced-motion settings apply

## Integration seams

Initial v2 can live inside `flow-system` status/HUD code.

Future extraction possible if Pi exposes a status-line extension API that can aggregate multiple plugins.

Inputs:
- `FlowQueueService`
- `FlowActivityJournalService` summary counts
- deck selectors
- optional future `FlowTeamSessionService`
- optional context/hook health signal

## Milestones

### SL Sprint 0 — status line spec and selector contract

Deliverables:
- this blueprint
- status selector interface
- acceptance criteria

Acceptance:
- no open design questions for compact state language
- Flow Deck v2 and status line language aligned

### SL Sprint 1 — status selector + v1 parity

Deliverables:
- pure compact selector
- current HUD/status rendering routed through selector
- tests for idle/single/queue/failed/writing-summary

Acceptance:
- existing v1 behavior preserved or improved
- no overlay/status tearing regression
- width clamps tested

### SL Sprint 2 — team-aware status line

Deliverables:
- team/topology segments
- context injection/hook health segment
- degraded/blocked state rendering

Acceptance:
- team sessions visible without opening deck
- no noisy feed duplication
- action hint always clear

## Non-goals

- full log viewer in status line
- chat message streaming in status line
- separate status daemon
- persistent metrics store

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

### Sprint 4 — team/session spec hardening before deep v2 build
Deliverables:
- TypeBox schemas for team sessions, team events, context packs, hook events
- deterministic prompt-composition plan for dynamic flow techniques
- hook ordering and failure policy
- ticket/session lifecycle map for team orchestration
- deck/status-line mapping for team state

Acceptance:
- team orchestration spec is implementation-ready
- no ambiguous persistence boundary
- no hidden autonomous branch mutation path
- context injection is scoped per agent/profile

### Sprint 5 — team-mode prototype behind explicit flag
Deliverables:
- explicit team session object created by command/tool input or dev flag
- grouped deck rows for team sessions
- structured handoff/review/blocker events in journal
- status line team summary support if status selector exists

Acceptance:
- can run a supervised fanout/review-loop without changing existing simple `flow_run`
- team events are visible, bounded, and deterministic
- all existing v1/v2 deck tests still pass

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
