# pi-edit positioning

Goal: place `pi-edit` against current fast-edit ecosystem, then lock first MCP surface.

## Bottom line

- **Best match for pi-edit**: `fastedit`-style AST-first + zero-model fast paths.
- **Why**: lowest token overhead on common symbol edits, local/self-host story, and strong refactor ergonomics.
- **Scope**: ship small core first; keep model-backed ops behind `fast_edit` / `fast_batch_edit` / `fast_multi_edit`, and AST ops for rename/search/read.

## Competitor / peer matrix

| Peer | Editing mechanism | Rough token overhead / edit | License + self-host story | Strengths vs fastedit | Weaknesses vs fastedit | Source URLs |
|---|---|---:|---|---|---|---|
| **Morph (morphllm)** | Fast-apply merge model. Prompt shape is `<instruction><code><update>`, or API `initial_code` + `edit_snippet`; model merges snippet into original code. Docs call out `10,500 tok/s` and `98%` accuracy. | **Medium**. Prompt carries original code + edit snippet; output is merged code. Roughly **hundreds of tokens** for small edits, scales with edited chunk size. | **Model/API is hosted**; docs mention zero-data-retention. Open-source bits exist for MCP/server package (`@morphllm/morphmcp`, MIT), but core apply model is not self-hosted in public docs. | Very fast, simple API, strong merge quality, easy external integration. | Still model-backed and hosted; no AST semantics; prompt still includes code context. | [Morph apply model docs](https://docs.morphllm.com/models/apply) · [Morph apply API](https://docs.morphllm.com/api-reference/endpoint/apply) · [OpenRouter model page](https://openrouter.ai/morph/morph-v3-fast/api) · [morphmcp npm metadata](https://registry.npmjs.org/@morphllm/morphmcp/latest) |
| **Relace** | Instant-apply code patching LLM. API uses `initial_code` + `edit_snippet`; docs frame it as merging AI-suggested edits into source. | **Medium**. Example docs show `245 prompt_tokens` / `187 completion_tokens` / `432 total` for a small sample. Roughly **200–500 tokens** for tiny edits; grows with chunk size. | Hosted API. Docs show bearer-token auth and Zero Data Retention; no public self-host path found in docs. | Clean hosted API, large context, fast merge, explicit usage reporting. | Hosted-only; still code-chunk merge, not AST-aware; token overhead higher than zero-model paths. | [Relace apply docs](https://docs.relace.ai/api-reference/instant-apply/apply) · [Relace quickstart](https://docs.relace.ai/docs/instant-apply/quickstart) · [OpenRouter model page](https://openrouter.ai/relace/relace-apply-3) |
| **OpenAI apply_patch** | Structured diff tool. Model emits `apply_patch_call` ops (`create_file`, `update_file`, `delete_file`) and harness applies V4A diff. | **Low-medium**. Patch schema is compact; overhead is mostly file context + patch ops. Roughly **tens to low hundreds of tokens** for small edits, not counting model reasoning. | Proprietary hosted API. No self-host path. | Strong for multi-file refactors, explicit file ops, easy iterative loop with error feedback. | Not AST-aware; still depends on model to describe changes; patch application logic external to model. | [OpenAI apply_patch docs](https://developers.openai.com/api/docs/guides/tools-apply-patch.md) |
| **Claude Code Edit** | Built-in `Edit` tool in Claude Code. Tool is “targeted edits to specific files”; lives in Claude Code’s tool loop with Read/Grep/Bash/LSP. | **Low-medium**. Targeted edit tool plus file context. Roughly **tens to low hundreds of tokens** for the edit instruction / patch, but not public per-edit accounting. | Proprietary Anthropic product. Available in terminal/IDE/desktop/browser; no self-host story in docs. | Tight product integration, good general agent loop, easy permissioning. | Closed surface; not AST-first; no local/self-host control; token behavior opaque. | [Claude Code tools reference](https://code.claude.com/docs/en/tools-reference.md) · [Claude Code overview](https://code.claude.com/docs/en/overview.md) |
| **Aider SEARCH/REPLACE** | Diff format is a series of search/replace blocks; unified-diff support also exists. Model repeats old code to locate edits. | **Medium-high**. Overhead is old+new text plus anchors. Roughly **2x changed span** plus context; brittle on large multi-hunk edits. | Apache 2.0; runs locally and can use local or remote LLMs. Self-host friendly. | Open-source, battle-tested, works with many model providers, flexible edit formats. | Higher token waste than AST/anchor-based editing; search/replace can fail on whitespace/reordering; no zero-model fast path. | [Aider edit formats](https://aider.chat/docs/more/edit-formats.html) · [Aider LICENSE](https://raw.githubusercontent.com/Aider-AI/aider/main/LICENSE.txt) · [Aider README](https://raw.githubusercontent.com/Aider-AI/aider/main/README.md) |
| **Cursor fast-apply** | Specialized full-file edit model + speculative edits. Cursor says planning happens in chat, applying should feel instant; model trained for full-file code edit task. | **High-ish output, low latency**. It is still a full-file rewrite style edit; token overhead is closer to rewritten file chunk than patch-sized deltas. No public per-edit API accounting. | Proprietary Cursor product; no self-host path. | Very fast UX, strong interactive flow, proprietary speculation stack. | Closed product; not MCP-friendly; no local control; not obviously AST-aware. | [Cursor instant apply blog](https://cursor.com/blog/instant-apply) · [Cursor pricing](https://cursor.com/pricing) |
| **fastedit** | AST-aware local editing. Uses tree-sitter to find symbols by name; deterministic paths splice text without model calls; complex edits use local 1.7B merge model. | **Lowest**. Zero-model paths cost **0 tokens**. Model merge path is about **~40 tokens** in README example. | MIT; self-hostable. Local 1.7B model + MCP server scripts; can run offline if deps/model are local. | Best token efficiency, symbol-aware, local/private, deterministic fast paths, explicit diff/undo support. | Language coverage limited to supported tree-sitter set; model-backed merge still needed for complex snippets. | [fastedit README](https://raw.githubusercontent.com/parcadei/fastedit/main/README.md) · [pyproject license](https://raw.githubusercontent.com/parcadei/fastedit/main/pyproject.toml) · [GitHub repo](https://github.com/parcadei/fastedit) |

## What this means for `pi-edit`

Ship fastedit-first. It wins when edit intent is already known and code structure matters.

### Recommended first 7 MCP tools

1. **`fast_read`** — cheap structure map before edits.
2. **`fast_search`** — symbol / reference locator for scope discovery.
3. **`fast_edit`** — main apply path; supports zero-model and model-backed merges.
4. **`fast_batch_edit`** — multiple hunks in one file; avoids repeated tool chatter.
5. **`fast_multi_edit`** — multi-file refactor in one round trip.
6. **`fast_rename_all`** — high-value AST refactor; best differentiator vs text-diff tools.
7. **`fast_diff`** — cheap verify step after edit.

### Defer to phase 2

- `fast_undo` — useful, but git rollback / workspace revert can cover v1.
- `fast_delete`, `fast_move`, `fast_move_to_file` — nice AST refactors, but less universal than the core 7.

### Why this set first

- Covers **discover → edit → verify** loop.
- Keeps tool surface small enough for first pi-edit release.
- Uses fastedit’s strongest advantage: **symbol-aware + zero-model paths**.
- Gives pi-edit enough breadth to handle single-file and cross-file work without exposing every niche op on day one.

## 10-case micro-benchmark matrix

Measure **`tokens_out`** and **`wall_ms`** for each case, comparing:

- **Baseline**: Pi native `Edit` tool
- **Candidate**: fastedit MCP tool path

Record: `success`, `tokens_out`, `wall_ms`, `files_touched`, `model_calls`.

| # | Edit archetype | Corpus shape | Baseline Edit path | fastedit path | What to watch |
|---|---|---|---|---|---|
| 1 | Trivial insert | Small function, add one line | native `Edit` | `fast_edit` with `after=` | Token floor; should be near-zero for fastedit deterministic path. |
| 2 | One-line substitution | Single function, one expression change | native `Edit` | `fast_edit` with `replace=` | Cheap exact splice; compare output tokens and latency. |
| 3 | Guard clause wrap | Add early return / try-catch in one fn | native `Edit` | `fast_edit` model path | Complex enough to force merge model; compare merge quality. |
| 4 | Function body expansion | Insert helper block inside fn | native `Edit` | `fast_batch_edit` | Repeated hunk efficiency; should beat repeated native edits. |
| 5 | Multi-hunk same file | 3 separated changes in one file | native `Edit` | `fast_batch_edit` | Batch advantage: fewer calls, lower total output tokens. |
| 6 | Cross-file import update | Rename symbol + fix imports in 2–3 files | native `Edit` | `fast_multi_edit` | Multi-file round trip vs multiple native edits. |
| 7 | Cross-file rename | Symbol rename across repo | native `Edit` | `fast_rename_all` | AST rename quality; no string-substring misses. |
| 8 | Move function within file | Move fn/class after another symbol | native `Edit` | `fast_move` | AST relocation; compare structural correctness. |
| 9 | Move symbol to new file | Extract fn/class to new file + imports | native `Edit` | `fast_move_to_file` | Import rewrite correctness; watch for broken refs. |
| 10 | Delete symbol | Remove dead fn/class + callsites | native `Edit` | `fast_delete` | AST delete safety; compare fallout and cleanup cost. |

### Benchmark rules

- Same prompt text for both paths.
- Same starting file snapshot.
- Warm cache once, then run 5 timed reps per case.
- Capture median `wall_ms` and median `tokens_out`.
- Add a correctness check: build/test or structural diff, whichever fits case.

### Go / no-go signals

- **Go** if fastedit cuts `tokens_out` on most cases and wins or ties `wall_ms` on 7/10 cases.
- **No-go** if AST path coverage is too narrow or deterministic paths fail on normal repo code.
- **Red flag** if model-backed fastedit path regresses on multi-hunk or rename-heavy edits.

## Short decision

- `pi-edit` should expose **fastedit core first**, not another text-diff wrapper.
- Default value prop: **less tokens, less churn, more structural safety**.
- If only one sentence: **ship AST-aware edit primitives, not generic LLM patch glue**.
