# Research: token-saving code edits in LLM coding agents

## Question
What edit schemas and edit workflows minimize emitted tokens for LLM coding agents, while keeping edits reliable? Focus: reduced-argument schemas, `oldText/newText` vs AST/symbol handles, lazy/marker edits, patch formats, semantic edit APIs, and benchmark methods for output-token savings.

## Findings
1. **Short, familiar patch formats beat raw JSON edits for model reliability; line numbers are a liability.** Aider’s docs say `whole` is simplest but token-heavy, `diff` is efficient, and `udiff` worked better than search/replace for GPT-4 Turbo because it reduced “lazy coding” and avoided brittle line numbers. Aider also found line numbers are bad for models and that flexible patch application matters a lot (9× fewer editing errors when flexibility is enabled). Sources: https://aider.chat/docs/more/edit-formats.html, https://aider.chat/docs/unified-diffs.html.

2. **Marker-based partial edits and AST/semantic handles are the best token-saving patterns when edits are localized or structural.** OpenCode Morph Fast Apply uses a tiny tool schema (`target_filepath`, `instructions`, `code_edit`) plus `// ... existing code ...` markers, and explicitly warns that omitting markers can delete surrounding code. Anthropic’s text editor tool similarly exposes compact commands (`view`, `str_replace`, `insert`) with optional truncation. Tree-sitter-edit provides a node-based API (`has_edit`, `edit`, `in_order_edits`) where edits are defined over nodes rather than raw file text, which is the right direction for semantic edits. Sources: https://github.com/JRedeker/opencode-morph-fast-apply, https://platform.claude.com/docs/en/agents-and-tools/tool-use/text-editor-tool, https://docs.rs/tree-sitter-edit/latest/tree_sitter_edit/trait.Editor.html.

3. **Benchmark token savings by counting real model output tokens, not just “format feels shorter,” and pair that with edit success/failure metrics.** Aider benchmarks track pass rate, malformed responses, lazy comments, and cost; Cursor’s Instant Apply blog evaluates speed with a fixed edit set and uses a consistent grader; token-efficiency repos like jcodemunch and Claude-token-efficient show that savings depend on exact counting method and session structure. Best practice: use a fixed tokenizer, separate input vs output tokens, record malformed-tool-call rate, and stratify by edit type (single-line, localized block, scattered/multi-file, structural rename). Sources: https://aider.chat/docs/benchmarks.html, https://cursor.com/blog/instant-apply, https://github.com/jgravelle/jcodemunch-mcp/blob/main/benchmarks/METHODOLOGY.md, https://github.com/drona23/claude-token-efficient/blob/main/BENCHMARK.md.

## Sources
- Aider edit formats: https://aider.chat/docs/more/edit-formats.html
- Aider unified diffs: https://aider.chat/docs/unified-diffs.html
- Aider benchmarks: https://aider.chat/docs/benchmarks.html
- Cursor Agent tools / apply docs: https://cursor.com/docs/agent/tools, https://docs.cursor.com/en/agent/apply
- Cursor Instant Apply blog: https://cursor.com/blog/instant-apply
- Anthropic text editor tool: https://platform.claude.com/docs/en/agents-and-tools/tool-use/text-editor-tool
- OpenCode Morph Fast Apply repo: https://github.com/JRedeker/opencode-morph-fast-apply
- OpenCode fast apply repo: https://github.com/tickernelz/opencode-fast-apply
- tree-sitter-edit docs: https://docs.rs/tree-sitter-edit/latest/tree_sitter_edit/trait.Editor.html, https://docs.rs/tree-sitter-edit/latest/tree_sitter_edit/
- jCodeMunch benchmark methodology: https://github.com/jgravelle/jcodemunch-mcp/blob/main/benchmarks/METHODOLOGY.md
- Claude token-efficient benchmark: https://github.com/drona23/claude-token-efficient/blob/main/BENCHMARK.md
- EDIT-Bench paper: https://waynechi.com/edit-bench/ and https://arxiv.org/pdf/2511.04486

## Version / Date Notes
- Research done on 2026-04-27.
- Aider docs pages were fetched from live site and show published time `Sat, 25 Apr 2026 16:45:23 GMT`; content can drift after that.
- Cursor and Anthropic docs are live product docs; schema names and supported parameters may change without notice.
- OpenCode plugin repos are active GitHub repos; README claims and token-savings numbers are repo-maintained, not independently audited.
- EDIT-Bench/CanItEdit style benchmark numbers depend on dataset version and tokenizer choice; compare only within same methodology.

## Open Questions
- Need public, reproducible benchmark for **output-token savings of edit schemas** specifically, not just end-to-end task success. Most public reports mix token cost, latency, and success.
- Need clearer evidence on whether **AST-symbol handle schemas** outperform marker-diff schemas on real mixed-language repos, beyond single-repo demos.
- Need separation between **model output tokens** and **tool/result tokens**; many public writeups only report one side.
- “fastedit” is ambiguous: some search hits are about **model editing**, not code editing. Should blitz compare only code-edit tools?

## Recommendation
For blitz, use a 3-layer mutation API:
1. **Discovery/read** returns AST node IDs / symbol handles / span anchors, not big text blobs.
2. **Edit** accepts compact intent + handle + partial snippet with markers, not raw whole-file `oldText/newText` except as fallback.
3. **Fallback** exposes a patch format (`udiff`-style or search/replace blocks) for ambiguous cases.

For evaluation, build a small benchmark that reports:
- output tokens per successful edit
- malformed tool-call rate
- edit apply success rate
- retry count
- task class: exact replace, localized block, scattered multi-hunk, rename, structural rewrite
- tokenizer used and prompt template version

That combo should give token savings without sacrificing edit reliability.