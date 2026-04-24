# blitz gap closure

Goal: close compensations for `blitz` without local ML. `blitz` stays deterministic-only, tree-sitter-first, single static Zig 0.16 binary.

## Executive summary

Use 3 layers: **structural query/rewrite**, **deterministic fuzzy anchor recovery**, and **LSP refactor bridge**. That combo likely recovers most of the 10–15% gap fastedit covers with its local merge model, while keeping common edits zero-model. For last-resort misses, send host LLM a narrow scope payload (`symbol + byte range + ~35 lines + sibling context`) so fallback token burn stays far below full-file replay.

**Weighted estimate:** top 3 techniques should lift practical coverage from ~85–90% to ~93–97% of real agent edits, and cut fallback-path token use by roughly **60–80%** on the remaining misses.

## Shortlist

| Technique | Source / URL | LOC-cost in Zig | Coverage boost estimate | Risk |
|---|---|---:|---:|---|
| Structural AST patches | Tree-sitter query syntax + predicates/directives: https://tree-sitter.github.io/tree-sitter/using-parsers/queries/1-syntax.html ; https://tree-sitter.github.io/tree-sitter/using-parsers/queries/2-operators.html ; https://tree-sitter.github.io/tree-sitter/using-parsers/queries/3-predicates-and-directives.html ; ast-grep rewrite: https://github.com/ast-grep/ast-grep ; srgn: https://github.com/alexpovel/srgn | 700–1200 | +4–7 pts | Query/compiler edge cases, language grammar drift |
| Fuzzy + whitespace-insensitive anchor recovery | Aider `aider/coders/search_replace.py` (relative-indent + diff-match-patch + git cherry-pick strategies); Continue `core/edit/lazy/deterministic.ts` (fastest-levenshtein); Cline `apply_patch` format and omission warning: `src/core/prompts/system-prompt/tools/apply_patch.ts`, `src/integrations/editor/detect-omission.ts`; diff-match-patch: https://github.com/google/diff-match-patch | 250–500 | +2–4 pts | False positive anchor picks, pathological reflow |
| LSP refactor bridge | LSP spec: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/ (`textDocument/codeAction`, `textDocument/rename`, `WorkspaceEdit`, `refactor.extract.function`) | 300–600 | +1–3 pts | Server support uneven; needs per-language capability table |
| AST-context marker expansion | Continue `getReplacementByMatching()` in `core/edit/lazy/replace.ts` (before/after line window); Tree-sitter anchors + sibling constraints from query syntax docs | 120–250 | +1–3 pts | Marker grammar must stay strict or ambiguity returns |
| Non-ML merge engines | diff-match-patch patch application; Aider `git_cherry_pick_*`; git `--minimal` merge behavior | 150–300 | +1–2 pts | Good at text merge, weak at semantic intent |
| Host LLM fallback scope payload | Internal design target; drive host `edit` with `symbol`, `byteRange`, `before`, `after`, `bodyExcerpt` | 100–180 | Not coverage; cuts fallback cost | Still model-backed; must stay rare and small |

## Top 3 picks

### 1) Structural AST patches

Implement `blitz` around a small patch IR: `find`, `rewrite`, `wrap`, `insert-before`, `insert-after`, `rename-symbol`, `move-node`. Compile each IR op into tree-sitter queries with captures, fields, anchors, and predicates, then apply rewrite templates against exact node spans. Tree-sitter query DSL already supports captures (`@name`), field constraints, wildcards, anchors, `#eq?`, `#match?`, and directives like `#strip!` / `#select-adjacent!`; ast-grep shows the same pattern→rewrite shape in a user-friendly wrapper. This is the biggest gap closer because it removes the need for the agent to repeat unchanged body text in many structural edits.

### 2) Deterministic fuzzy anchor recovery

When exact anchors fail, do not jump straight to host LLM. Try a bounded recovery ladder: normalize whitespace, strip blank-line noise, compare with relative indentation, then use best-effort patching. Aider already does this with `relative_indent`, `strip_blank_lines`, `diff_match_patch`, and `git cherry-pick --minimal`; Continue already uses Levenshtein-based similarity for AST node matching before it falls back. `blitz` should mirror that idea with byte-range-local search only: exact match → whitespace-insensitive match → sibling-window fuzzy match → DMP patch apply. Keep search bounded to the candidate symbol/block range so determinism stays high.

### 3) LSP refactor bridge + narrow host fallback

For supported languages, ask the language server for `codeAction` / `rename` / `prepareRename`, then apply `WorkspaceEdit` directly. LSP already standardizes refactor kinds like `refactor.extract.function`, plus workspace-wide rename and multi-edit payloads. When no server action exists, emit a compact fallback scope object to host LLM: `{ symbolName, filePath, byteStart, byteEnd, ancestorKind, siblingBefore, siblingAfter, excerpt~35 lines }`. That lets the host model repair only the local hole, not restate whole file. This is where token burn drops most on hard misses.

## What to defer / reject

- **Cursor reverse-engineering** — public docs do not expose anchor-fallback internals; not evidence-grade.
- **Pure exact SEARCH/REPLACE** — too brittle for the 10–15% gap; whitespace and reflow break it.
- **Local merge model** — violates deterministic-only constraint.
- **Full-file model fallback** — kills token target; fallback must stay scope-narrow.
- **Generic git merge driver as primary** — good backup, bad intent model; too coarse for many refactors.
- **Chasing public token-savings numbers for no-model tools** — I did not find credible published token metrics for Aider/Continue/Cline/Cursor; only fastedit-style docs publish explicit output-token savings. Treat the lack of numbers as a signal that this space is mostly anecdotal.

## Honest bottom line

With these compensations, `blitz` will still miss roughly **3–7%** of fastedit’s model-path edits, mostly semantic, cross-file, or under-specified transforms.