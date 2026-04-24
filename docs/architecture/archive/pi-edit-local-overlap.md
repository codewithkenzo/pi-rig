# pi-edit local overlap map

Scope: installed-but-edit-adjacent Pi extensions vs planned `pi-edit`, so mutation lane stays non-overlapping.

Sources used:
- `~/.pi/agent/extensions/pi-tool-codex/config.json`
- `~/.pi/agent/extensions/pi-rtk-optimizer/config.json`
- `~/.pi/agent/extensions/pi-fff.json`
- `~/.pi/agent/packages/oh-pi-extensions-patched/extensions/watchdog.ts`
- `~/.npm-global/lib/node_modules/pi-mono-multi-edit/{package.json,README.md,index.ts}`
- `github.com/vinyroli/pi-tool-codex` README + `src/{index.ts,tool-overrides.ts,diff-renderer.ts,diff-presentation.ts,types.ts}`
- `github.com/MasuRii/pi-rtk-optimizer` README + `src/{index.ts,output-compactor.ts,command-rewriter.ts}`
- `@mariozechner/pi-coding-agent` `dist/core/tools/edit.d.ts`
- `docs/architecture/pi-edit-ecosystem-compare.md`
- `docs/architecture/pi-edit-fastedit-integration.md`

## `pi-tool-codex`

| Field | Result |
|---|---|
| Overrides | Config in `~/.pi/agent/extensions/pi-tool-codex/config.json` owns only `write: true`; `read/grep/find/ls/bash/edit` are `false`. Package code can wrap all built-ins, but active install only owns `write`. |
| Adds | Compact renderers for `read`, `grep`, `find`, `ls`, `bash`, `edit`, `write`; MCP output modes; native user message box; settings modal; working timer; thinking / interruption / assistant styling; diff presentation controls. |
| Touches-edit? | Yes, but only presentation around built-in `edit` / `write` results. No AST edit, no patch engine, no multi-edit op. |
| Conflicts-with-pi-edit? | Low on mutation, high on UI overlap. `pi-edit` should not copy renderers, status bullets, message box, or diff view. |

Notes:
- `diffViewMode: "auto"` renders **unified** on normal widths, **compact** below 18 cols, and **summary** below 8 cols. Split view happens only when config explicitly says `split` and width is large enough.
- No separate diff tool registered. Diff is view-layer only, attached to built-in `edit` / `write` result rendering.
- No AST-aware or speed-focused edit surface. This is transcript / TUI optimization, not source mutation.

## `pi-rtk-optimizer`

| Field | Result |
|---|---|
| Overrides | No tool overrides. Hooks `tool_call`, `tool_result`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end`, `before_agent_start`. |
| Adds | `/rtk` settings modal, command rewrite rules, output compaction pipeline, compaction metrics, Windows bash fixups. |
| Touches-edit? | No direct edit surface. It mutates bash command text before execution and compacts tool output after the fact. Source code filtering can affect `read` payloads, so it can indirectly change what LLM sees before an edit. |
| Conflicts-with-pi-edit? | Low direct overlap; medium indirect risk if source filtering hides exact text needed for precise edits. Do not duplicate compaction or rewrite logic in `pi-edit`. |

Notes:
- Read/source compaction is the whole point here. It is not a source editor.
- Installed config shows `outputCompaction.enabled: true` and `sourceCodeFilteringEnabled: true`, so it can shorten reads enough to trigger edit mismatch pathologies.

## `pi-fff`

| Field | Result |
|---|---|
| Overrides | Fuzzy `read` / `grep` behavior. |
| Adds | Fuzzy file resolution, indexed content search, agent search tools like `find_files`, `resolve_file`, `related_files`, `fff_grep`, `fff_multi_grep`, plus `/fff-*` commands. |
| Touches-edit? | No direct edit surface. |
| Conflicts-with-pi-edit? | Low. Useful for discovery, not mutation. `pi-edit` can consume it for path / symbol discovery, but should not re-build fuzzy path search. |

Notes:
- Good companion for discovery, but it stays on navigation / search side.

## `watchdog`

| Field | Result |
|---|---|
| Overrides | None in current config. |
| Adds | CPU / memory / event-loop monitoring, safe-mode escalation, status-bar / overlay alerts. |
| Touches-edit? | No. |
| Conflicts-with-pi-edit? | None. Operational safety only. |

## Extra overlap hit: `pi-mono-multi-edit`

| Field | Result |
|---|---|
| Overrides | Built-in `edit` tool directly. |
| Adds | `multi` batch edits across files; Codex-style `patch` payloads; virtual-FS preflight; atomic rollback; diff output. |
| Touches-edit? | Yes. This is a real edit mutation surface. |
| Conflicts-with-pi-edit? | High. This is the closest installed overlap. |

Source shape:
- Tool schema: `edit({ path: string; edits: [{ oldText, newText }...] })` in `@mariozechner/pi-coding-agent`
- `pi-mono-multi-edit` extends that with `multi` and `patch`

## What `pi-tool-codex` provides that `pi-edit` should NOT re-implement

- transcript compaction / hidden output modes
- native user message box
- diff renderer / split-unified-auto layout logic
- bash output presentation modes
- read / grep / find / ls output modes
- MCP output modes
- thinking / interruption / assistant styling
- working timer / status bullets
- tool ownership controls / settings modal

## What `pi-edit` uniquely provides

- AST symbol scope via `fast_read`, `fast_search`, `fast_rename_all`
- deterministic splice paths via `fast_edit` / `fast_batch_edit` / `fast_multi_edit`
- zero-model fast path for simple edits
- local 1.7B merge-model fallback for complex snippets
- structural rename / move / delete semantics beyond text-diff tools

No installed extension above covers that combo.

## Built-in `edit` vs planned `pi_edit_batch`

### Pi core `edit`

Current pi core `edit` schema is:

```ts
{
  path: string;
  edits: Array<{ oldText: string; newText: string }>;
}
```

So core edit already allows multiple hunks in one call, but only inside one file. Token shape is text-replace centric: it repeats exact `oldText` anchors and `newText` payloads.

### Planned `pi_edit_batch`

`pi_edit_batch` in the fastedit lane is:

```ts
{
  file: string;
  edits: Array<{ snippet: string; after?: string; replace?: string }>;
}
```

That shape is anchor/snippet centric, not raw `oldText` replacement centric. It is meant to drive deterministic fast paths first, then merge-model fallback when needed.

## Call

`pi-edit` does **not** need wider scope on UI or compaction. It **does** need scope restraint on generic text-batch / patch syntax, because `pi-mono-multi-edit` already owns that lane. Keep `pi-edit` centered on AST-aware symbol ops, deterministic splice, and local merge fallback; let `pi-tool-codex` own presentation and `pi-rtk-optimizer` own output rewriting.
