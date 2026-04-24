# blitz — Zig 0.16 AST-aware fast-edit CLI

Greenfield design for `codewithkenzo/blitz`, a standalone Zig 0.16 CLI that powers the `@codewithkenzo/pi-blitz` extension. Replaces the earlier fastedit-wrapper approach (archived under `archive/fastedit-integration-superseded.md`). Pre-implementation; no code yet.

## Status

- Status: **spec draft, not yet implemented**.
- Architecture supersedes: `archive/fastedit-integration-superseded.md`.
- Companion docs still in force: `pi-extension-surface-notes.md`, `pi-edit-positioning.md`, `pi-edit-ecosystem-compare.md`, `pi-edit-local-overlap.md`, `blitz-gap-closure.md`.

## Goal

Deliver the same **output-token savings** as fastedit (44-54% on handled edits) with:
- **zero local ML model** (no MLX, no vLLM, no Python)
- **zero interpreter** (static Zig binary, ~3-5 MB)
- **~2-5 ms per tool call** cold start (tree-sitter C-native, no FFI overhead)
- **single binary**, ships via npm prebuilts per platform (esbuild/biome pattern)
- **MIT license**, Kenzo-owned

## Non-goals

- Run or embed any language model.
- Subprocess Python or ship a Python runtime.
- Reinvent diff viewers, terminal UI, or output compaction (already covered by `pi-tool-codex` + `pi-rtk-optimizer`).
- Overlap with `pi-mono-multi-edit`'s text-`oldText/newText` lane; blitz stays **AST-symbol-anchor**.
- Deep LSP client in v1 (reserved for v1.1 gap-closure phase).

## Repository split

```
codewithkenzo/blitz                — Zig 0.16 CLI, standalone MIT tool
  src/
    main.zig              — std.process.Init.Minimal entry, CLI dispatch
    cli.zig               — arg/JSON parser, stdin input helpers
    ast.zig               — @cImport tree-sitter, per-language parse cache
    symbols.zig           — symbol resolution, scope extraction
    splice.zig            — deterministic text-match + direct-swap engine
    fuzzy.zig             — whitespace-insensitive anchor recovery (v0.2)
    queries.zig           — structural tree-sitter query rewrites (v0.2)
    backup.zig            — SHA-keyed backup store + atomic write
    lock.zig              — per-file advisory lock (fcntl)
    fallback.zig          — scope payload emitter for host-LLM fallback
  grammars/
    tree-sitter-rust/      parser.c  (vendored, MIT-compatible)
    tree-sitter-typescript/
    tree-sitter-tsx/
    tree-sitter-python/
    tree-sitter-go/
  build.zig               — cross-compile matrix, test step, install
  build.zig.zon           — pinned deps
  .zig-version            — pinned 0.16.x
  LICENSE MIT
  README.md

codewithkenzo/pi-blitz             — Pi extension, TS/Bun/Effect v4
  index.ts                — default export, runTool boundary, Effect.runPromiseExit
  src/
    errors.ts             — Data.TaggedError union
    tool-runtime.ts       — Exit/Cause discrimination, throw vs isError
    tools.ts              — 8 tools → spawnCollect(blitz …)
    doctor.ts             — Effect.cached binary/version check
    paths.ts              — canonical realpath + symlink escape guard
    mutex.ts              — Effect.acquireUseRelease per-canonical-path
    config.ts             — user/project .pi/pi-blitz.json loader
    telemetry.ts          — pi_blitz_metrics entry + session persist
  skills/pi-blitz/SKILL.md
  package.json            — optionalDependencies: blitz-<platform>
  README.md
```

Binary shipping (precedent: esbuild, biome, rolldown, turbo):

```
@codewithkenzo/blitz-darwin-arm64
@codewithkenzo/blitz-darwin-x64
@codewithkenzo/blitz-linux-x64-musl
@codewithkenzo/blitz-linux-arm64-musl
@codewithkenzo/blitz-windows-x64
```

Each ~3-5 MB. `pi-blitz` declares all as `optionalDependencies`; postinstall resolves the right one.

## Zig 0.16 alignment

- **Entry signature:** `pub fn main(init: std.process.Init.Minimal) !void` (0.16 new shape).
- **Allocator:** `std.heap.GeneralPurposeAllocator` at root, arena allocators per tool call (free-everything-on-exit pattern; no long-lived allocations needed).
- **I/O:** blocking `std.fs`, `std.process` — sufficient for a short-lived CLI. **Do not pull in `std.Io` Threaded/Evented for MVP**; revisit only if we add a persistent sidecar mode.
- **JSON:** `std.json.Value` for `--edits` / `--file-edits` payloads.
- **Hash:** `std.crypto.hash.sha2.Sha256` for canonical backup keys (dodge fastedit's raw-path collision bug).
- **Cross-compile:** `zig build -Dtarget=aarch64-macos-none` / `x86_64-linux-musl` / `x86_64-windows-gnu` etc. — built-in, no Docker.
- **Dev loop:** `zig build --watch -fincremental --fork=/path/to/grammar-fork` for sub-second rebuilds.
- **Grammars:** vendored `parser.c` per language, compiled via `addCSourceFile` at build time. Hermetic; no system tree-sitter required.

## CLI surface (v0.1 = 5 commands)

All commands write to stdout; errors to stderr with exit codes matching fastedit conventions for compatibility:
- `0` success
- `1` generic failure (missing file, parse error, no refs, no backup)
- `2` reserved for future `delete` cross-file-callers refusal
- `124` timeout / abort (inherited from `shared/subprocess.ts::spawnCollect`)

| Command | Args | Description |
|---|---|---|
| `blitz read <file>` | file path | AST structure summary (imports, definitions, line ranges). Small file (≤100 lines): full content. |
| `blitz edit <file> --snippet - --after <sym>\|--replace <sym>` | file + stdin snippet | Deterministic splice or direct-swap. `# ... existing code ...` markers resolved via text-match + fuzzy fallback. |
| `blitz batch-edit <file> --edits -` | file + stdin JSON | Multiple symbol-anchored edits in one pass. |
| `blitz rename <file> <old> <new> [--dry-run]` | AST-verified rename, skips strings/comments, writes diff tail. |
| `blitz undo <file>` | Revert last backup, prints diff. |

Deferred to v0.2 (after gap-closure techniques land):
- `blitz multi-edit --file-edits -` — cross-file edits
- `blitz rename-all <root> <old> <new> [--dry-run]` — cross-file rename walker
- `blitz query <file> --pattern <ts-query> --rewrite <template>` — structural AST rewrite (exposes the tree-sitter query engine directly)

Deferred to v0.3:
- `blitz move`, `blitz delete`, `blitz move-to-file`

Never in blitz (host-LLM territory):
- Full-file rewrites → host uses core `edit` or `write`
- Unanchored structural changes → host gets scope payload + uses core `edit`

## Input format — strict grammar

To minimize ambiguity vs fastedit's lenient `# ... existing code ...` marker, blitz accepts **two** explicit marker forms:

1. **Full-replace** (no markers) — snippet is the complete new symbol body; direct swap.
2. **Preserve-with-markers** — exactly one of:
   - `# ... existing code ...` (fastedit-compatible)
   - `# @keep` (strict, recommended; matches up to next blitz directive)
   - `# @keep lines=N` (numeric anchor, unambiguous)

Language-specific comment variants handled: `//`, `#`, `<!--`, `--`, `(*`, `;`, `%`. Detected from tree-sitter grammar metadata.

Rationale: strict markers remove text-match ambiguity upfront → deterministic coverage goes up without a model (see `blitz-gap-closure.md` §3).

## Core edit algorithm

```
1. parse file with tree-sitter (cached per {path, mtime})
2. resolve target symbol:
   - exact match on node @name capture
   - scope to function/class/method/variable by kind hint
   - bail with "symbol not found, available: [...]" on miss
3. extract target node byte range + ~3-line sibling context before/after
4. classify snippet:
   a. no markers → direct swap (0 model tokens, 0 tree-sitter work beyond scope)
   b. markers present → split into new-line + keep-region spans
5. apply edit:
   Layer A: exact text-match splice (fastedit's core algorithm, ported ~300 LOC)
   Layer B: whitespace-insensitive + relative-indent fuzzy match (v0.2)
   Layer C: tree-sitter structural query rewrite (v0.2)
6. post-edit validate:
   - re-parse merged file via tree-sitter
   - reject write if parse is broken AND original parsed clean (regression guard)
   - atomic write: temp file → fsync → rename
7. backup store:
   - key = sha256(realpath(file) + "\0" + mtime_ns_pre_edit)
   - store pre-edit contents under ~/.cache/blitz/backup/<key>.bak
   - single-depth undo (latest-only) per path
8. print result + optional unified-diff tail
```

## Gap closure (v0.2) — see `blitz-gap-closure.md`

Three techniques layer onto v0.1's Layer A:

### Layer B — Fuzzy anchor recovery (~250-500 LOC)
When exact match fails, ladder:
- normalize whitespace → retry exact
- strip blank lines → retry exact
- relative-indent comparison (Aider pattern)
- bounded fastest-levenshtein on sibling window (Continue pattern)
- diff-match-patch as last deterministic resort

Coverage boost: +2-4 points.

### Layer C — Structural tree-sitter queries (~700-1200 LOC)
Expose a small patch IR compiled to tree-sitter queries:
- `find`, `rewrite`, `wrap`, `insert-before`, `insert-after`, `rename-symbol`, `move-node`
- uses tree-sitter query DSL: captures, fields, anchors, `#eq?`, `#match?`, directives
- agent writes: `"wrap target with try/except, keep body"` — blitz compiles to `(try_statement body: (block @keep))` rewrite

Coverage boost: +4-7 points. This is the biggest no-model gap-closer.

### Layer D — Host-LLM scope payload fallback
When A+B+C all fail, emit:

```json
{
  "status": "needs_host_merge",
  "file": "src/foo.ts",
  "symbol": "handleRequest",
  "kind": "function",
  "byteStart": 1842,
  "byteEnd": 2109,
  "ancestorKind": "class_declaration",
  "ancestorName": "RequestRouter",
  "siblingBefore": "private validate(req: Request): void { ... }",
  "siblingAfter": "private logResponse(res: Response): void { ... }",
  "excerpt": "... ~35 lines of the target node ..."
}
```

Agent calls core `edit` (or `pi-mono-multi-edit`) with this payload as context. Fallback-path token cost drops 60-80% vs full-file replay.

## LSP bridge (v1.1)

Per-language LSP server as optional backend for structured refactors:
- `textDocument/rename`, `textDocument/codeAction` (kind: `refactor.extract.function`, `refactor.inline`, `refactor.rewrite`), `workspace/executeCommand`.
- Applied via `WorkspaceEdit`.
- Blitz spawns the LSP server lazily on first refactor request; caches for session; kills on exit.
- Language availability announced via `blitz doctor`.

Coverage boost over no-LSP: +1-3 points. Deferred because LSP lifecycle management is its own project.

## Honest numbers (after gap closure)

| Metric | Native `edit` | fastedit (with model) | blitz v0.1 (A only) | blitz v0.2 (A+B+C) | blitz v1.1 (+LSP) |
|---|---|---|---|---|---|
| Handled-case token savings | 0% | 50-54% | **45-55%** | **45-55%** | **45-55%** |
| Real-workload coverage | 100% (always runs) | 100% | ~75-85% | **~93-97%** | **~95-98%** |
| Fallback regression | n/a | n/a | 0% (agent uses core `edit`) | 0% | 0% |
| Weighted aggregate savings | 0% | ~50% | ~35-45% | **~42-52%** | **~44-53%** |
| Wall-time per call (det path) | <1 ms | ~95 ms | **~3-5 ms** | ~5-8 ms | ~5-8 ms |
| Wall-time per call (model/fallback) | — | ~500 ms | host `edit` round trip | host `edit` round trip | LSP ~50-200 ms |
| Binary size | n/a | ~4 GB (model + MLX + Python) | **~4 MB** | ~4 MB | ~4 MB |
| Runtime deps | none | Python + MLX/vLLM + 3 GB model | **none** | none | none |

**Residual miss after v0.2:** ~3-7% of fastedit's model-path edits (semantic refactors, cross-file, under-specified) — these fall back cleanly to host `edit` with the compact scope payload.

## Pi extension (`@codewithkenzo/pi-blitz`)

Effect v4 patterns verbatim from `extensions/flow-system`. 8 tools mapped to blitz CLI commands (same shape as the superseded pi-edit spec, just swapping `fastedit` → `blitz`):

| Pi tool | CLI |
|---|---|
| `pi_blitz_read` | `blitz read <file>` |
| `pi_blitz_edit` | `blitz edit <file> --snippet - --after\|--replace <sym>` |
| `pi_blitz_batch` | `blitz batch-edit <file> --edits -` |
| `pi_blitz_rename` | `blitz rename <file> <old> <new>` |
| `pi_blitz_undo` | `blitz undo <file>` |
| `pi_blitz_doctor` | `blitz doctor` |
| `pi_blitz_query` | `blitz query <file> --pattern ... --rewrite ...` (v0.2) |
| `pi_blitz_multi` | `blitz multi-edit --file-edits -` (v0.2) |

Error taxonomy, canonical path policy, per-path mutex, doctor memoization, telemetry — identical to the reviewed pi-edit spec (see `archive/fastedit-integration-superseded.md` §Effect v4, §Error taxonomy, §Config, §Doctor). The wrapper is backend-agnostic; only `spawnCollect` target changes.

## Benchmark gate (acceptance)

Same 10-case matrix from `pi-edit-positioning.md`. v0.1 gate:
- Median `tokens_out` reduction ≥ 40% on 7/10 cases for **handled** edits (exclude cases 8-10 until those tools land).
- Median `wall_ms` < 20 ms on deterministic cases (cases 1, 2, 5).
- 100% structural correctness on cases 1, 2, 5, 7.
- Fallback cases return a valid scope payload the agent can act on.

Harness lives under `@codewithkenzo/pi-blitz/test/benchmark/`. CI runs against a stub blitz that echoes canned output; local runs use the real binary.

## Risks

| Risk | Mitigation |
|---|---|
| Zig 0.16 nightly API drift | Pin `.zig-version`; target 0.16.0 stable when it lands (imminent); fall back to latest compiling 0.16-dev meanwhile |
| tree-sitter grammar update churn | Vendor specific tagged versions in `grammars/`; upgrade via explicit commits |
| Cross-compile matrix breakage | GitHub Actions matrix runs per-target on every PR; release gated on all green |
| Fuzzy match false positives | Confidence threshold + dry-run previews + refusal on ambiguous matches (refuse > repair) |
| User on unsupported language | v0.1 ships 5 grammars; `blitz doctor` shows supported set; unsupported → emit scope payload immediately |
| Single-depth undo surprises | Docs + `blitz doctor` state "last-only" explicitly; pair with core Pi rollback / pi-rewind for deeper history |
| Ownership of vendored grammar code | All target grammars are MIT; attribution in `NOTICE.md` |

## Open questions (decide before Zig v0.1 starts)

1. **Name.** Staying with `blitz`? Alternatives: `fted`, `blaze`, `kenzo-edit`, `piedit`. Name is public; pick before repo init.
2. **Vendor vs system tree-sitter.** Vendored is hermetic but adds ~2MB per grammar. Recommend vendored.
3. **Backup store location.** `~/.cache/blitz/` vs `.blitz/` per-repo. Recommend user-cache + per-repo override via env.
4. **JSON over stdio in v0.1** or text-only? Recommend text stdout for v0.1 (matches fastedit conventions, LLM-friendly), JSON stdio deferred to v0.2 if needed for pi-blitz details payloads.
5. **Ship Pi extension before blitz v0.1 is GA?** Recommend: pi-blitz v0.0.1 alpha depends on blitz built-from-source so Pi users can dogfood; public v0.1 waits for prebuilt binaries.

## Sequence (target: 3 sprints)

**Sprint 1 (week 1):** Zig skeleton + tree-sitter link + `blitz read` + `blitz edit --after` + `blitz edit --replace` (direct-swap only, no markers). Cross-compile CI green. Binary ships from local build.

**Sprint 2 (week 2):** Port fastedit's text-match splice (Layer A) → `# ... existing code ...` and `# @keep` markers work. Backup store + `blitz undo` + `blitz rename`. Tests. `blitz doctor`.

**Sprint 3 (week 3):** Pi extension `@codewithkenzo/pi-blitz` TS scaffold with Effect v4 surface. npm prebuilt matrix. First benchmark run. `blitz-gap-closure.md` Layer B (fuzzy) lands as stretch.

**v0.2 follow-up (weeks 4-6):** Layer C structural tree-sitter queries + `multi-edit` + `rename-all`. LSP bridge research.

## Cross-references

- `blitz-gap-closure.md` — the 10-15% no-model gap + three compensation techniques
- `pi-edit-positioning.md` — competitive matrix
- `pi-edit-ecosystem-compare.md` — Pi ecosystem inventory
- `pi-edit-local-overlap.md` — installed-plugin overlap map, carve-outs
- `pi-extension-surface-notes.md` — pi-mono ExtensionAPI reference
- `next-spec-synthesis.md` — master roadmap
- `archive/fastedit-integration-superseded.md` — prior fastedit-wrapper design, retained for context
