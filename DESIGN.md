---
version: 1
name: Flow Deck v2 — Premium Terminal Mission Control
description: Design source of truth for Pi Dispatch / Flow Deck v2 and slim Flow Status Line v2. Terminal-first, dense, accessible, API-gated mission-control UI for supervising Flow jobs and planned Team Run sessions.
---

# Flow Deck v2 — Premium Terminal Mission Control

## Overview

Flow Deck v2 is a live operational terminal for orchestrating Pi agents.

Scope is locked to:
- Flow Deck v2 main overlay
- slim Flow Status Line v2 segment
- no extra screens before v2 ships, except optional DESIGN/reference assets

Primary user flow:
1. inspect queue/team state
2. select agent/job
3. read coordinator truth and activity stream
4. inspect handoff/detail/artifact
5. act only when checkpoint, block, or cancel is needed

This design supports the planned Team Run model only where APIs and Flow data sources can back the UI. It is not a web dashboard, analytics UI, marketing mockup, or generic card layout.

Primary direction comes from latest mocks:
- `docs/media/design/flow-deck-v2/flow-deck-v2-reference-01.png` — main deck reference; supersedes `/tmp/pi-clipboard-769e4fd0-5926-4127-b3b1-630d08b99450.png`
- `docs/media/design/flow-deck-v2/flow-deck-v2-style-board-01.png` — style board / visual territory; supersedes `/tmp/clipboard-images/clip_20260427_063336.png`

Older `/tmp` clipboard refs are superseded by the repo-local assets above.

Use the dispatch deck mock as structural reference. Use the status language described below as status-line reference.

## API-Gated UI Rules

Only show UI elements that map to confirmed/current or explicitly planned Flow/Pi data sources:

- Flow queue/job state
- activity journal rows
- streamed JSON subprocess events
- TypeBox-validated Team Run/session state
- context packet sidecar entries
- hook decisions/events
- artifact paths/digests/timestamps
- `ctx.ui.custom` overlay
- `ctx.ui.setStatus` / `ctx.ui.setWidget`
- read-only session data

If capability is unconfirmed, label it as queued/checkpoint/future or remove it.

Hard constraints:
- Do not imply live child-session prompt mutation unless a child control channel exists.
- Child context updates are shown as `packet pending`, `checkpoint requested`, or queued for next run/checkpoint.
- Main/coordinator steering may use Pi session APIs where supported.
- Status line must integrate with existing Pi status providers, not replace them.

## Colors

All colors are optimized for low-glare dark environments, high legibility, and semantic clarity.

```yaml
color:
  ink_bg:            "#0B0F14"
  surface:           "#11161D"
  surface_raised:    "#161C24"
  border_muted:      "#1F2630"
  border_focus:      "#2F3A4A"
  text_primary:      "#E6EDF3"
  text_secondary:    "#9FB0C0"
  text_muted:        "#5C6B7A"
  accent_violet:     "#7C5CFF"
  accent_blue:       "#4DA3FF"
  accent_cyan:       "#2ED3B7"
  status_warning:    "#F5A524"
  status_success:    "#3CCF91"
  status_error:      "#FF5C5C"
```

### State color mapping

| State | Color | Application |
|---|---|---|
| selected | accent_violet | 2px strip/border only |
| focused | border_focus | border + subtle alpha glow |
| fresh | status_success | text label/dot |
| stale_context | status_warning | text label/dot |
| pending_checkpoint | accent_cyan | text label/chip |
| running | accent_blue | status text/dot |
| blocked | status_error | status text/marker |
| warning | status_warning | status text/marker |
| done | status_success | status text/marker |
| failed | status_error | status text/marker |
| final_verification_pending | accent_violet | label/chip |

Rules:
- No gradients except subtle alpha-only focus glow.
- Accents are semantic, not decorative.
- Borders stay visible; terminal precision beats softness.
- Never flood panels with state color.
- State must remain legible in monochrome/ASCII fallback through text labels.

## Typography

```yaml
font_family:
  primary: "JetBrains Mono, IBM Plex Mono, monospace"

type:
  terminal_title:
    size: 14px
    weight: 600
    letter_spacing: 0.04em
    color: text_primary
  section_label:
    size: 11px
    weight: 600
    letter_spacing: 0.12em
    color: text_muted
    transform: uppercase
  row_title:
    size: 13px
    weight: 500
    color: text_primary
  row_subtitle:
    size: 12px
    weight: 400
    color: text_secondary
  event_text:
    size: 12px
    weight: 400
    color: text_primary
  metric_number:
    size: 13px
    weight: 600
    color: text_primary
  muted_hint:
    size: 11px
    weight: 400
    color: text_muted
  status_label:
    size: 11px
    weight: 600
    letter_spacing: 0.08em
```

Rules:
- No large type scales.
- Density beats expressiveness.
- Use tabular numerals for counts, durations, and budgets.
- Align rows to baseline/grid rhythm.
- Do not use icon-only meaning.
- Keep compact row text short enough to avoid wrapping.

Truncation rules:
- agent labels: preserve name/role first
- event rows: preserve source → target, kind, then detail
- status line: preserve `flow/team`, state/topology, blocked/final-check/checkpoint, `/flow`
- truncate task labels before state labels

## Layout

### Core rhythm

```yaml
grid:
  base_unit: 4px
  rhythm: 4px vertical cadence
spacing:
  1ch: "~8px"
  2ch: "~16px"
  4ch: "~32px"
layout:
  header_height:        32px
  footer_height:        28px
  row_height_compact:   24px
  row_height_expanded:  40px
  panel_padding:        "8px 12px"
  divider:
    thickness: 1px
    color: border_muted
```

Rows snap to 4px rhythm. Compact rows are default. Expanded rows are only for selected/detail state. Avoid card-grid spacing.

Divider discipline: use fewer structural dividers; rely on whitespace, alignment, and section labels.

### Main deck layout

- Full terminal overlay.
- Top bar fixed height: 32px.
- Bottom command/health area fixed height where possible.
- Stable overlay height during streaming; no layout jump.
- One main screen only; no modal maze, no extra decks.

Wide panel ratios:
- left rail: 26–31%
- center: 37–44%
- right: 30–32%

Degrade order:
1. wide: 3 columns
2. medium: right pane becomes toggled detail
3. narrow: rail + selected stream/detail toggle
4. tiny: compact list + selected summary only

### Status line layout

Status line is an appendable segment beside existing Pi providers such as model, quota, git, worktree, and theme indicators.

It must not own the full footer unless alone.

Quiet default:
- idle should have low visual weight
- no noisy animation
- no heavy pill styling

Priority when truncating:
1. `flow` / `team`
2. state/topology
3. blocked/final-check/checkpoint
4. `/flow`
5. task label/details

Examples:

```text
flow idle · /flow
flow coder running · deck layout pass… · 02:14 · ctx:fresh · /flow
flow 2 running · 1 pending · 1 summary · ctx:fresh · /flow
team review-loop · 4 agents · ctx:fresh · final-check · /flow
team fanout · 3 agents · ctx:pending · ckpt requested · /flow
team blocked:context · builder stale · open deck · /flow
flow done · diff + checkpoint · review ready · /flow
```

## Data Hierarchy / Render Priority

Renderer priority:
1. selected agent/job
2. live activity
3. handoff/synthesis
4. artifacts
5. secondary metadata

If space is constrained, hide secondary metadata first. Do not hide status, selected identity, or blocked reason.

## TUI Constraints

- No wrapping in core rows.
- No scrolling full transcript in main repaint.
- No layout jump during streaming.
- Stable width, stable height.
- Cheap redraws only.
- No heavyweight UI state library.
- No full transcript scans during redraw.
- Use existing overlay + status surfaces.
- Use bounded selectors/view models.

## Elevation & Depth

- No decorative depth.
- Depth exists only for focus, state, selection.
- One selected object at a time gets highest emphasis.
- Never use blur or animated glow.

```yaml
opacity:
  focus_glow: 0.15
```

## Shapes

```yaml
radius:
  sm: 2px
```

Rules:
- 2px radius max.
- Avoid pill-heavy status UI.
- Avoid rounded SaaS card feel.
- Lines/dividers should feel terminal-precise.

## Components

### Top Bar

- Height: 32px.
- Single line, no wrapping.
- API-backed fields only: queue counts, workspace, mode, clock, selected topology/team state when available.
- Surface with bottom border. No shadow.

### Status Line Segment

- Append/replace segment in surrounding Pi status system.
- Compact and quiet; not a second dashboard header.
- Preserve fallback/truncation priority from status line layout.

### Team Rail Row

Fields:
- label
- role
- freshness
- budget/tool count
- phase/state
- blocked reason when relevant

Selected = raised surface + focus border. Blocked = warning/error text/marker only; do not flood row.

### Selected Agent Row

Selected row must be unmistakable but not neon.

Only emphasis recipe:
- `surface_raised`
- 2px `accent_violet` left border
- optional subtle alpha glow

### Activity Stream Row

Schema:
- timestamp
- kind
- source → target
- packet/event
- detail

Rows are read-only journal slices, not full transcript replay. Do not render full transcripts in the main stream.

### Context Packet Chip

Small inline chip only. Never grows into a card.

Packet states:
- proposed
- pending
- accepted
- injected
- stale

### Hook Event Row

Same family as activity row.

API-gated hook outcomes:
- success
- warn
- block
- inject

Marker color maps to outcome.

### Handoff Detail Section

Right-panel selected detail. Content order:
1. accepted facts
2. decisions
3. risks
4. files touched
5. artifacts
6. next action
7. token-efficient summary

Use compact key-value blocks, not equal-weight cards.

### Artifact List Item

Preferred details:
- sidecar path
- digest
- timestamp
- type/size

Preview only one selected artifact at a time.

### Footer Key Hint

Observation/navigation-first:
- `tab` next pane
- arrows move
- `enter` inspect
- `space` expand
- `f` follow
- `p` pin
- `c` cancel
- `esc` close

Manual context injection is not a primary user action.

## Implementation Mapping

| Design block | Code/data source |
|---|---|
| top bar | queue summary/status selector |
| left rail | jobs/team sessions list selector |
| center coordinator truth | team session synthesis / accepted facts |
| center activity stream | FlowActivityJournal + future team events |
| right detail | selected job output, handoff, artifact index |
| context packet chip | context packet sidecar/selector |
| hook event row | hook decision/event selector |
| status line | compact status selector + `ctx.ui.setStatus` integration |
| footer hints | deck controller focus/keymap |

## Do's and Don'ts

### Do

- Keep UI terminal-first and buildable.
- Prefer API-backed state labels over speculative visuals.
- Favor menu/navigation clarity over decorative diagrams.
- Make selected row/pane obvious.
- Show exact, API-backed state.
- Keep status line appendable and slim.
- Use sidecar/artifact paths for large detail.
- Use pure selectors to drive views.

### Don't

- Do not create a web dashboard look.
- Do not use rounded SaaS cards.
- Do not imply unimplemented live child-session mutation.
- Do not scan/render full transcripts in TUI redraw.
- Do not show many large artifact cards at equal priority.
- Do not flood panels with semantic colors.
- Do not add extra screens before selected mock is implemented.
- Do not introduce extra motion or animated layout to imply intelligence.
- Do not create equal-weight cards across all panels.

## Responsive Behavior

Fallback order:
1. wide: 3-column layout
2. medium: right pane toggled
3. narrow: rail + selected detail only
4. tiny: compact queue/team list + status line

Status line truncates, never wraps.

## Motion

```yaml
transition:
  fast: "120ms linear"
```

Allowed:
- cursor blink
- subtle row highlight transition ≤120ms
- one active pulse max

Avoid:
- animated blur
- bouncing panels
- attention-stealing stream row animation
- continuous decorative motion

## Accessibility

- Strong contrast on dark background.
- State legible by text label alone.
- Do not rely on color alone.
- Focus visible via border/strip, not color only.
- ASCII fallback required for icons/glyphs.

ASCII examples:
- active: `>`
- queue: `=`
- blocked: `!`
- done: `✓` or `OK`
- pending: `…`
- cancelled: `x`

## Implementation Tokens

```yaml
radius:
  sm: 2px
opacity:
  focus_glow: 0.15
transition:
  fast: 120ms linear
z_index:
  base: 0
  overlay: 10
```

## Mental Model

This is:

> A live operational terminal for orchestrating agents.

Not:

> A dashboard, analytics tool, or marketing UI.
