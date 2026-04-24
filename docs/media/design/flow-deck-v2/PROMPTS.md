# Flow Deck v2 visual generation prompts

Purpose: keep image-generation prompts and resulting references tied to Flow Deck v2 implementation. This is an asset manifest, not a separate product spec. Source-of-truth behavior remains `docs/dev/flow-deck-v2-blueprint.md`.

## Design taste rules for all prompts

Apply these constraints to Prompt A/B/C variants:
- product craft over novelty: this is working operator software, not concept art
- premium terminal command-center, closer to smart-device/control-panel UI than generic SaaS, but minimal and buildable
- high signal density, but hierarchy must be obvious in 2 seconds; prioritize navigation/menus/readability over decorative widgets
- one strong selected/focused object; avoid card soup
- subtle depth, edge light, and glow only where they communicate focus, state, or safety
- calm Electric Midnight palette: deep ink/charcoal base, muted violet/blue/cyan accents, amber warning, green success, controlled red error, chrome text/borders
- terminal mono typography with tabular numerals; readable text labels, no fake unreadable microtext
- keyboard-first, observation/navigation-first: shortcuts expose inspect/follow/pin/cancel, while context injection appears as coordinator/hook activity
- stable frame: no floating web cards, no moving layout, no animated blur, no modal maze
- API-gated realism: only show UI elements that can plausibly be powered by Pi extension APIs, Flow queue state, JSON subprocess events, hook events, sidecar artifacts, or status/widget integration
- avoid impossible live child-session controls; represent child context injection as queued/checkpoint/backstage state unless clearly labeled as coordinator/main-session steering
- every state should imply implementation tokens later: row height, border tone, focus tone, selected tone, muted tone, alert tone

Mock variants to generate before choosing direction:
1. Conservative Terminal — closest to current TUI, safest to implement
2. Premium Command Center — strongest design taste, still terminal-native
3. Dense Operator Mode — highest information density for power users

After mocks are chosen, create `DESIGN.md` from selected visual direction before implementation.

## Prompt A — Flow Deck v2 mission-control overlay

Generate a polished terminal-native UI concept for a Pi coding-agent extension called Flow Deck v2. The UI is a full-screen terminal overlay for supervising Pi agent background jobs and subagents.

Scene requirements:
- dark editorial terminal interface, premium operator-console feel, not a web dashboard
- one strong hero overlay with stable top bar and bottom command bar
- left rail: team run + agent list with topology label, roles, context freshness, budget state, current phase, and selected row emphasis
- center panel: coordinator view at top with chosen topology rationale, accepted team truth, and live activity stream below; stream rows show timestamp, event kind, source/target, context-packet title, short text
- right panel: structured handoff/synthesis pane with accepted facts, decisions, risks, files touched, diff/checkpoint/review artifact cards, transcript path hint, and error state support
- compact status language visible: pending, running, writing-summary, blocked, done, failed, cancelled
- Pi-plugin ecosystem indicators: edit artifact, review verdict, rewind checkpoint, sandbox policy, context pack freshness
- team/supervision indicators: coordinator, auto-selected topology, fanout, chain, review-loop, handoff, plan-approve, schema-fanout
- context-engineering indicators: packet injected, packet pending, stale agent context, accepted decision, correction sent, budget warning, checkpoint requested
- no browser chrome, no macOS window chrome, no generic SaaS cards
- terminal typography, subtle ANSI accents, high contrast, readable at small sizes
- palette: calm black/charcoal base, muted violet/blue/cyan accents, amber warning, red error, green success
- visual density high but organized; selected subagent must be unmistakable
- include tiny hint row focused on observation/navigation: tab focus, arrows move, enter inspect, space expand, f follow, p pin, c cancel, esc close; context injection exists as agent/backstage action, not primary user shortcut

Composition:
- aspect ratio 16:10
- 3-region body: left 31%, center 37%, right 32%
- top bar contains title `Pi Dispatch / Flow Deck v2`, queue counts, workspace basename, mode, clock
- bottom bar contains keybind hints and compact health sentence; no heavy menus, one main paged screen controlled by arrows/toggles
- stable frame, no animated blur, no floating cards outside terminal frame

Style keywords:
terminal mission control, developer operations console, command-line TUI, editorial dark UI, crisp typography, production software, low-noise observability, Pi agent orchestration, subtle glow, thin borders, stable grid.

Negative prompt:
web app dashboard, browser address bar, glossy marketing mockup, cartoon robots, 3D mascot, neon cyberpunk overload, unreadable microtext, random code walls, mobile UI, generic analytics charts, excessive gradients, floating glass cards, fake macOS traffic lights.

## Prompt B — Flow Status Line v2 states

Generate a compact terminal status-line design sheet for a Pi coding-agent extension. It shows Flow Status Line v2 states as horizontal terminal bars, like a TUI footer/status strip.

Scene requirements:
- multiple status-line variants stacked vertically on one dark canvas
- each bar is one terminal row high or two rows max
- stable width, no wrapping, clear truncation behavior
- states shown:
  1. idle: `flow idle · /flow`
  2. single active: `flow coder running · deck layout pass · 02:14 · /flow`
  3. queue: `flow 2 running · 1 pending · 1 writing-summary · /flow`
  4. team fresh: `team review-loop · 4 agents · ctx:fresh · final-check · /flow`
  5. team pending: `team fanout · 3 agents · ctx:pending · ckpt requested · /flow`
  6. blocked: `team blocked:context · builder stale · open deck`
  7. artifact: `flow done · diff + rewind checkpoint · review ready`
- include tiny colored segments for active/success/warning/error/muted, but keep quiet default state
- use Nerd Font style glyphs optionally but keep ASCII fallback obvious
- terminal-native, readable, compact, no panels or browser UI
- match Flow Deck v2 palette: charcoal, muted violet/blue/cyan, amber, green, red
- feel sleek and precise: no heavy pills, no crowded emoji, no full dashboard fragments
- demonstrate truncation: preserve `team/topology`, `ctx:*`, `blocked/final-check`, and `/flow` first

Negative prompt:
full dashboard, web navbar, large cards, rounded SaaS pills only, mobile mockup, unreadable text, random icons, loud rainbow theme, charts.

## Known generated references

Current session memory mentions prior design ref:
- `/tmp/clipboard-images/clip_20260423_042821.png`

That file is no longer present in `/tmp/clipboard-images` after restart. If recovered from clipboard/history, copy it into this folder as:
- `flow-deck-v2-reference-01.png`

Future generated images should be saved here with names:
- `flow-deck-v2-reference-02.png`
- `flow-status-line-v2-reference-01.png`


## Prompt C — Team Run backstage / context packets

Generate a polished terminal-native UI concept for Pi Dispatch Team Run. This is one main Flow Deck screen showing a main/coordinator agent supervising 3–4 subagents through dynamic context packets. It should feel agent-first: user made a ticket/spec, main agent auto-selected the best topology, user watches and steers only when needed.

Scene requirements:
- dark terminal TUI, premium operator-console, no web chrome
- one main screen with paged/toggleable panes, not many menus
- visible topology: `review-loop` auto-selected from ticket/spec, with roles `scout`, `builder`, `reviewer`, `verifier`
- show coordinator lane: current mission, topology rationale, accepted facts, next steering action
- show context packet rail: small typed packets like `decision`, `constraint`, `finding`, `risk`, `test-result`, `handoff`, `budget-warning`; each has source → target, status `proposed/accepted/injected/pending`, tiny token estimate; keep it minimal, table-like, and TUI-buildable
- show agent freshness: one agent `fresh`, one `stale`, one `pending checkpoint`; make stale context obvious but not alarming; avoid implying live child prompt mutation unless marked queued/checkpoint
- show soft runtime budget: `warn 12m`, `checkpoint requested`, not immediate hard kill
- show observed tool-call budget: `42/80 tools`, label as Flow-observed, not Pi-core max-turns
- show spawn curation: skills injected by role, memory snippets selected, ticket/spec attached, verification policy `final-only`
- show hook events: `preflight ok`, `spawn-curate set skills`, `checkpoint requested`, `verification pack pending`
- show structured handoff pane: files read, files changed, commands run, artifacts, risks, next actions, token-efficient summary
- include bottom shortcuts focused on observation/navigation: arrows, tab, enter inspect, space expand, f follow, p pin, c cancel, esc close; show context injection as coordinator/backstage event rather than manual-first control
- visual density high but readable, crisp terminal typography, subtle ANSI accents; reduce decorative diagrams, extra meters, and theatrical chrome

Composition:
- aspect ratio 16:10
- left 26% team/agent rail
- center 44% coordinator + live team events/context packets
- right 30% structured synthesis/handoff/artifacts
- top bar: `Pi Dispatch / Team Run`, topology, ticket id, branch/worktree safety, active agents, budget health
- bottom bar: keyboard hints + one-line health sentence; visually compatible with existing Pi footer/status elements, not a competing status system

Negative prompt:
web dashboard, many modal menus, cartoon robots, unreadable text, generic Kanban, random charts, browser chrome, neon overload, floating glass cards, impossible buttons that cannot map to Pi TUI/events, excessive role diagrams, too many progress meters.

Implementation realism note:
Prefer elements that map to current/confirmed Pi surfaces: `ctx.ui.custom` overlay, `ctx.ui.setStatus`/status append, Flow queue/job state, bounded activity journal, streamed JSON tool/message events, ExtensionAPI hooks (`before_agent_start`, `context`, `tool_call`, `tool_result`), sidecar artifact paths, and read-only session data.

## Prompt D — DESIGN.md extraction reference sheet

Generate a design-system reference sheet for Flow Deck v2 after Prompt C direction. This is not another screen; it is a clean terminal UI style board that can be converted into DESIGN.md.

Include:
- palette swatches labeled ink, surface, overlay, border-muted, text-primary, text-secondary, violet, blue, cyan, amber, green, red
- typography examples using terminal mono: title, section label, row title, row subtitle, metric/tabular number, event text, muted hint
- spacing scale shown as terminal grid rhythm: 1ch, 2ch, 4ch, row heights, header/footer height
- component mini-specs: top bar, status line segment, team rail row, selected agent row, context packet chip, event row, handoff card, artifact card, footer key hint
- state variants: focused, selected, stale, pending injection, blocked, checkpoint requested, final verification pending, done
- no browser chrome; dark editorial terminal canvas; crisp labels; high contrast

Purpose: make it easy to write `DESIGN.md` tokens and component rules from the mock.

## Mock review notes — 2026-04-24

Latest references:
- `clip_20260424_102336.png` — rich Flow Deck; good data model, too busy/decorative in places
- `clip_20260424_102606.png` — status line sheet; strong direction, must be slimmer to integrate with existing Pi footer/status providers
- `clip_20260424_102917.png` — mission-control variant; closer to implementation realism and minimality

Refinement rules for next prompt pass:
- prefer `clip_20260424_102917.png` structure over the busier variant
- keep three-region layout, but reduce decorative topology diagrams, progress bars, and artifact card grid density
- make left rail the primary navigation/menu: agent list, phase, freshness, budget, blocked reason
- center stays core: coordinator rationale, accepted truth, activity stream with tabs/filters
- right stays synthesis/detail: facts, decisions, risks, files, artifacts; one selected artifact detail at a time, not many equal cards
- show only API-backed controls: inspect, expand, follow, pin, cancel, open; avoid manual inject/synthesize buttons in footer
- child context injection should read as `packet pending` / `checkpoint requested`, not live editable controls
- status line should be one appendable segment that coexists with model/quota/git/worktree indicators; no standalone giant status component in actual TUI
- no extra product screens required before DESIGN.md; generate only one optional design-system reference sheet (Prompt D) after choosing final visual direction
