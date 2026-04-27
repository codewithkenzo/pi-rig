# pi-edit ecosystem compare

Public Pi/pi-agent mutation + rollback surfaces found in requested sources. Scope is `pi-mono`, npm `@mariozechner/*`, `pi-agent`/`pi-extension`/`pi-coding-agent`-style packages, and listed orgs.

Legend: token overhead is qualitative (`low` / `med` / `high`) because most projects do not publish per-call token counts.

## Inventory

| Surface | Repo / npm | Status | Editing surface | Token overhead | AST-aware | Rollback / undo | License | Last release |
|---|---|---|---|---|---|---|---|---|
| **Pi core `edit` / `write`** | `badlogic/pi-mono` → `@mariozechner/pi-coding-agent` / `@mariozechner/pi-agent-core` | Core built-in | `edit` = exact text replace in one file; multiple changes via `edits[]`; `write` = create / overwrite full file. Both are overrideable by same tool name. No separate built-in `MultiEdit` surface; multi-hunk edit lives inside `edit.edits[]`. | `edit`: low-med; `write`: med-high | No | No built-in rollback; diff preview only | MIT | `0.70.0` / `2026-04-23` |
| **`@yofriadi/pi-ast`** | `yofriadi/pi-extensions` / `@yofriadi/pi-ast` | Public npm ext | `ast_search`, `ast_rewrite`, `sg_health`; `ast_rewrite` is dry-run by default, `apply: true` to mutate | Low | Yes | No undo; dry-run preview only | Not stated | `0.1.1` / `2026-02-17` |
| **`@yofriadi/pi-hashline-edit`** | `yofriadi/pi-extensions` / `@yofriadi/pi-hashline-edit` | Public npm lib / extension substrate | Hash-addressed line edits: `set_line`, `replace_lines`, `insert_after`; `replace` exists but is handled separately, not by `applyHashlineEdits` | Low-med | No | No | Not stated | `0.1.1` / `2026-02-17` |
| **`@yofriadi/pi-review`** | `yofriadi/pi-extensions` / `@yofriadi/pi-review` | Public npm ext | `/review`, `/review-status`, `/review-reset`; tools `report_finding` and `submit_review` for compact diff review / verdict capture | Low | No | No | Not stated | `1.0.0` / `2026-02-17` |
| **`pi-diff-review`** | `badlogic/pi-diff-review` / no npm package found | Public source-only ext | `/diff-review` native review window; scopes: `git diff`, `last commit`, `all files`; inserts feedback prompt into Pi editor | Low / none | No | No | Not stated | No release tag; latest commit `2026-04-06` |
| **`pi-rewind-hook`** | `badlogic/pi-rewind-hook` mirror; npm `pi-rewind-hook` | Public npm hook / rollback path | Auto checkpoints on session start + each turn; restore via `/branch` flow; files + conversation restore options | Low | No | Yes; checkpoint restore, no redo stack | MIT | `1.8.3` / `2026-04-16` |
| **`pi-rewind`** | `arpagon/pi-rewind` / `pi-rewind` | Public npm ext | `/rewind`, `Esc+Esc`, checkpoint browser, diff preview, safe restore, redo stack, fork/tree integration | Low | No | Yes; multi-level undo / redo | MIT | `0.5.0` / `2026-03-31` |

No other public diff / patch / edit / rollback surface showed up in codewithkenzo, parcadei, robhowley, feniix, or vinyroli beyond the rows above.

## Core vs override notes

- `edit` in `pi-coding-agent` is already multi-hunk inside one file; `edits[]` are matched against original file, not incrementally.
- `write` is full rewrite / new-file lane. Best for generated files or complete replacement, not surgical patching.
- Built-ins can be overridden by registering same tool name (`edit`, `write`, etc.). If override omits custom renderers, core renderer still applies.
- So `pi-edit` should not chase a fake `MultiEdit` split; core already has the right primitive shape for one-file multi-hunk edits.

## Positioning vs `pi-edit`

`pi-edit` should sit between core `edit` and rollback tools: AST-first when it can, text-safe when it must, and cheap to preview. `pi-ast` is closest on structure, but it is shell-wrapper flavored and stops at `ast-grep` rewrite semantics; `hashline-edit` tightens addressability and staleness checks, but stays line-level; `pi-review` and `pi-diff-review` are review surfaces, not mutation lanes; `pi-rewind*` solves recovery, not primary editing. The wedge for `pi-edit` is still the same: lower token waste than raw text patching, better structural correctness than line diffs, and a clean path to pair with rollback later instead of pretending edit and undo are the same tool.

## Source basis

- `pi-mono` docs + core source: built-in tools, override semantics, `edit`/`write` behavior.
- `yofriadi/pi-extensions`: `ast`, `hashline-edit`, `review` package manifests and sources.
- `badlogic/pi-diff-review`: command-only diff review UI.
- `pi-rewind-hook` / `pi-rewind`: public rollback extensions from npm + GitHub.
