# Research: fastedit internals

## Question
What does the original Python fastedit implementation do internally: how it saves output tokens, edit command schema, marker/lazy-edit semantics, local model role, prompt patterns, fallback behavior, and benchmark methodology? How does that compare to our Zig blitz design?

## Findings

### 1) Public source exists, and it is `parcadei/fastedit`
- Repo is public on GitHub and describes itself as “AST-aware code editing powered by a fine-tuned 1.7B model.” It explicitly frames token savings as the main goal. [https://github.com/parcadei/fastedit](https://github.com/parcadei/fastedit)
- `hiyouga/FastEdit` is a different, older project about editing LLM weights, not this code-editing tool. [https://github.com/hiyouga/FastEdit](https://github.com/hiyouga/FastEdit)

### 2) Token savings come from AST scoping + symbol-targeted edits, not from shorter prompts alone
- README says conventional diffs/SEARCH-REPLACE/apply_patch force model to repeat old code to say where edit goes, while FastEdit uses tree-sitter to find target by name so agent writes only change plus a line or two of context. [README.md](https://raw.githubusercontent.com/parcadei/fastedit/main/README.md)
- `fastedit edit --replace <symbol>` auto-preserves declaration/signature from AST and can resolve body-only snippets; `--after <symbol>` is pure insert and returns 0 tokens. `chunked_merge.py` and `cli.py` show that deterministic paths and direct-swap paths avoid model calls entirely. [src/fastedit/inference/chunked_merge.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/inference/chunked_merge.py), [src/fastedit/cli.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/cli.py)
- README’s measured agent-output reduction is ~43–54% across GPT-5.4 / Opus / Grok examples; model-card says deterministic path covers ~74% of edits at 0 tokens, combined production ~98% accuracy with ~10 avg tokens. [README.md](https://raw.githubusercontent.com/parcadei/fastedit/main/README.md), [MODEL_CARD.md](https://raw.githubusercontent.com/parcadei/fastedit/main/MODEL_CARD.md)

### 3) Edit command schema is small, explicit, and symbol-centered
- CLI subcommands: `read`, `search`, `diff`, `edit`, `batch-edit`, `multi-edit`, `delete`, `move`, `rename`, `rename-all`, `move-to-file`, `undo`, plus `pull`/`doctor`/`mcp-install`. [src/fastedit/cli.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/cli.py)
- Core edit shapes:
  - `edit <file> --snippet ... --after <symbol>`: insert after symbol, pure AST, 0 tokens.
  - `edit <file> --snippet ... --replace <symbol>`: replace symbol body, deterministic text-match first, then model fallback.
  - `batch-edit --edits JSON[]`: sequential edits in one file.
  - `multi-edit --file-edits JSON[]`: sequential edits across files. [src/fastedit/cli.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/cli.py), [src/fastedit/mcp/tools_edit.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/mcp/tools_edit.py)
- MCP tool surface is 12 tools: `fast_edit`, `fast_batch_edit`, `fast_multi_edit`, `fast_read`, `fast_search`, `fast_diff`, `fast_delete`, `fast_move`, `fast_move_to_file`, `fast_rename`, `fast_rename_all`, `fast_undo`. [README.md](https://raw.githubusercontent.com/parcadei/fastedit/main/README.md), [src/fastedit/mcp/server.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/mcp/server.py)

### 4) Marker/lazy-edit semantics are lenient and position-aware
- Accepted marker forms: `# ... existing code ...`, `// ... existing code ...`, short `#...`, `//...`, and `…`; `prompt_templates.py` and `text_match.py` normalize short forms to canonical long forms. [src/fastedit/data_gen/prompt_templates.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/data_gen/prompt_templates.py), [src/fastedit/inference/text_match.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/inference/text_match.py)
- Position semantics are built into deterministic matcher:
  - marker + new lines → bottom insert
  - new lines + marker → top insert
  - marker inside body with anchors → preserve gap and splice new lines around marker
  - no marker → drop original gap / replace block
  - multi-marker sections or insufficient anchors → fall back to model. [src/fastedit/inference/text_match.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/inference/text_match.py)
- Same semantics are documented in README, MCP descriptions, and model card. [README.md](https://raw.githubusercontent.com/parcadei/fastedit/main/README.md), [src/fastedit/mcp/tools_edit.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/mcp/tools_edit.py), [MODEL_CARD.md](https://raw.githubusercontent.com/parcadei/fastedit/main/MODEL_CARD.md)

### 5) Local model role: fallback merge engine, not primary edit locator
- Model is a fine-tuned Qwen2.5-Coder-1.5B-Instruct derivative packaged as FastEdit 1.7B. It merges an original chunk plus edit snippet into `<updated-code>` output. [MODEL_CARD.md](https://raw.githubusercontent.com/parcadei/fastedit/main/MODEL_CARD.md)
- Prompt contract is strict: system prompt is a single sentence plus `/no_think`; user prompt says preserve structure/order/comments/indentation exactly and output only code wrapped in `<updated-code>` tags. [src/fastedit/data_gen/prompt_templates.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/data_gen/prompt_templates.py), [src/fastedit/inference/merge.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/inference/merge.py)
- Backend adapters: local MLX engine, vLLM engine, or generic OpenAI-compatible `llm` backend. Thinking mode is disabled by default because hidden reasoning tokens can tank throughput. [src/fastedit/inference/mlx_engine.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/inference/mlx_engine.py), [src/fastedit/inference/vllm_engine.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/inference/vllm_engine.py), [src/fastedit/inference/llm_engine.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/inference/llm_engine.py)

### 6) Fallback behavior is layered, and most non-model operations are hard-coded zero-token fast paths
- `fastedit edit`: deterministic text-match first, then direct AST swap, then model chunked merge. If parse fails, code may retry once; if output still parse-invalid, it writes anyway with warning. [src/fastedit/inference/chunked_merge.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/inference/chunked_merge.py), [src/fastedit/cli.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/cli.py)
- `after=` insertion is pure AST and never touches model. `replace=` can auto-prepend signature from AST if omitted in snippet. `[replace]` can also short-circuit to direct-swap when snippet is a full redefinition. [src/fastedit/inference/chunked_merge.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/inference/chunked_merge.py)
- `delete`, `move`, `rename`, `rename-all`, `move-to-file`, `diff`, `undo`, `read`, and `search` are all non-model operations; some use tldr refs/structure and some fall open on infra failures. `fast_delete` refuses when cross-file callers exist unless `--force`; `rename`/`rename-all` skip strings/comments/docstrings via tldr references; `move_to_file` rewrites imports and flags hard cases for manual review. [src/fastedit/inference/caller_safety.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/inference/caller_safety.py), [src/fastedit/inference/rename.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/inference/rename.py), [src/fastedit/inference/move_to_file.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/inference/move_to_file.py)

### 7) Benchmark methodology is public and fairly explicit
- `docs/testing-matrix.md` says FastEdit reached true 13/13 language coverage on M1/M2/M3/M4 after outsourcing AST work to tldr primitives; it tracks feature coverage across 13 languages and documents specific bug fixes. [docs/testing-matrix.md](https://raw.githubusercontent.com/parcadei/fastedit/main/docs/testing-matrix.md)
- `tests/test_deterministic_benchmark.py` generates 22 edit patterns / 73 cases and reports per-pattern pass/fail/skip plus aggregate deterministic accuracy and model-needed ratio. Patterns include add-guard, wrap_block, change_signature, add_decorator, reorder_statements, add_parameter, remove_parameter, etc. [tests/test_deterministic_benchmark.py](https://raw.githubusercontent.com/parcadei/fastedit/main/tests/test_deterministic_benchmark.py)
- `tests/test_deterministic_vs_model.py` uses `data/benchmark.jsonl`, reconstructs production path via AST scope → deterministic edit → splice, and reports model benchmark as 143/156 = 91.7% in its summary print. `benchmark.py` evaluates examples by loading JSONL, extracting original/update/expected/language/edit_type, running `engine.merge`, then scoring exact match, AST match, parse validity, diff lines, similarity, latency, and tokens/sec. [tests/test_deterministic_vs_model.py](https://raw.githubusercontent.com/parcadei/fastedit/main/tests/test_deterministic_vs_model.py), [src/fastedit/eval/benchmark.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/eval/benchmark.py)
- Model card and README both report benchmark slices: deterministic 74% of edits at 100% accuracy and <1ms; model path ~26% of edits at ~92% and ~500ms; combined ~98% and ~130ms avg. [MODEL_CARD.md](https://raw.githubusercontent.com/parcadei/fastedit/main/MODEL_CARD.md), [README.md](https://raw.githubusercontent.com/parcadei/fastedit/main/README.md)

### 8) Comparison to our Zig blitz design
- FastEdit’s core trade is “local 1.7B model + AST-scoped fallback”; blitz’s design is “no local model, deterministic layers only, host-LLM scope payload as last resort.” That is the right architectural split if we want to remove Python/model/runtime drag. [docs/architecture/blitz.md](docs/architecture/blitz.md)
- FastEdit’s marker dialect is intentionally permissive; blitz’s plan is stricter grammar (`// ... existing code ...`, `# ...`, `@keep`, etc.). That should reduce ambiguity, but it will not match FastEdit’s tolerance for malformed or under-specified snippets. [docs/architecture/blitz.md](docs/architecture/blitz.md), [src/fastedit/inference/text_match.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/inference/text_match.py)
- FastEdit’s public benchmark is stronger than blitz’s current public proof point: 22-pattern deterministic suite + 156-example model benchmark, whereas blitz currently has a smaller local microbench and a planned 10-case matrix. [tests/test_deterministic_benchmark.py](https://raw.githubusercontent.com/parcadei/fastedit/main/tests/test_deterministic_benchmark.py), [MODEL_CARD.md](https://raw.githubusercontent.com/parcadei/fastedit/main/MODEL_CARD.md), [docs/architecture/blitz.md](docs/architecture/blitz.md)

## Sources
- `parcadei/fastedit` repo root, README, MODEL_CARD, CLAUDE, source tree, tests, and docs: [https://github.com/parcadei/fastedit](https://github.com/parcadei/fastedit)
- Direct file sources:
  - [README.md](https://raw.githubusercontent.com/parcadei/fastedit/main/README.md)
  - [MODEL_CARD.md](https://raw.githubusercontent.com/parcadei/fastedit/main/MODEL_CARD.md)
  - [CLAUDE.md](https://raw.githubusercontent.com/parcadei/fastedit/main/CLAUDE.md)
  - [src/fastedit/cli.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/cli.py)
  - [src/fastedit/inference/chunked_merge.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/inference/chunked_merge.py)
  - [src/fastedit/inference/text_match.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/inference/text_match.py)
  - [src/fastedit/inference/merge.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/inference/merge.py)
  - [src/fastedit/inference/mlx_engine.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/inference/mlx_engine.py)
  - [src/fastedit/inference/vllm_engine.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/inference/vllm_engine.py)
  - [src/fastedit/inference/llm_engine.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/inference/llm_engine.py)
  - [src/fastedit/inference/rename.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/inference/rename.py)
  - [src/fastedit/inference/caller_safety.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/inference/caller_safety.py)
  - [src/fastedit/inference/move_to_file.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/inference/move_to_file.py)
  - [src/fastedit/data_gen/prompt_templates.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/data_gen/prompt_templates.py)
  - [src/fastedit/eval/benchmark.py](https://raw.githubusercontent.com/parcadei/fastedit/main/src/fastedit/eval/benchmark.py)
  - [tests/test_deterministic_benchmark.py](https://raw.githubusercontent.com/parcadei/fastedit/main/tests/test_deterministic_benchmark.py)
  - [tests/test_deterministic_vs_model.py](https://raw.githubusercontent.com/parcadei/fastedit/main/tests/test_deterministic_vs_model.py)
  - [docs/testing-matrix.md](https://raw.githubusercontent.com/parcadei/fastedit/main/docs/testing-matrix.md)
  - [docs/architecture/blitz.md](docs/architecture/blitz.md)

## Version / Date Notes
- Source fetched 2026-04-27 from `main`; README / source / tests may drift after this date.
- README shows latest release `v0.5.0` dated 2026-04-23. GitHub tree commit messages on `main` show newer post-release docs/tests in late April 2026.
- Public benchmark numbers in README/model card are current-branch claims at fetch time, not frozen release guarantees.
- Some repo files referenced by `benchmark.py` (`src/fastedit/eval/metrics.py`, `data/benchmark.jsonl`) did not resolve cleanly via raw fetch during this session; benchmark behavior was still recoverable from `benchmark.py` plus the deterministic benchmark tests.

## Open Questions
- Exact contents and location of `data/benchmark.jsonl` / `metrics.py` on current `main` could not be fetched directly from raw URLs in this session.
- Whether `main`’s benchmark numbers already reflect all post-release fixes or only the latest local branch state.
- Whether the public repo will stay aligned with the current `main` prompt contract and marker semantics, or if these will shift before a tagged release.

## Recommendation
- For blitz, copy FastEdit’s useful part: AST-scoped symbol selection, zero-token `after=` inserts, and explicit benchmark coverage accounting.
- Do not copy FastEdit’s hidden local-model fallback or lenient marker grammar; blitz should keep deterministic-first semantics and make fallback explicit as host-LLM scope payload only.
- Add a benchmark gate closer to FastEdit’s style: per-edit-type coverage, exact/AST match, parse-valid, and a repeatable production-path benchmark, not just token reduction claims.
