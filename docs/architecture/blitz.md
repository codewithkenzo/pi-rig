# blitz — Zig 0.16 AST-aware fast-edit CLI + `@codewithkenzo/pi-blitz` Pi extension

Single source of truth. Supersedes and absorbs `blitz-design.md`, `blitz-gap-closure.md`, `blitz-perf-patterns.md`, `pi-edit-positioning.md`, `pi-edit-ecosystem-compare.md`, `pi-edit-local-overlap.md`, `zig-0.16-verification.md` (all archived).

Status: **spec draft, not yet implemented.** All numeric targets in this doc are hypotheses until the benchmark harness in §10 runs.

## 1. North star

Ship an AST-aware edit CLI that preserves fastedit's **output-token savings** and removes its runtime drag:

- **Zero local ML model** — no MLX, no vLLM, no 1.7B Qwen.
- **Zero interpreter** — single static Zig 0.16 binary, target 3-5 MB (hypothesis; see §10).
- **Zero Python** — nothing to install besides the binary.
- **Cold-call latency target:** sub-10 ms deterministic path. Real number TBD (see §10).
- **MIT**, Kenzo-owned, ships via npm prebuilts per platform (esbuild/biome pattern).

The extension (`@codewithkenzo/pi-blitz`) is a thin Effect v4 wrapper around the binary.

## 2. Ecosystem slot (why this is not a duplicate)

Already shipped or installed, do **not** reimplement:

| Area | Tool | blitz stays out |
|---|---|---|
| Core text-`oldText/newText` edit | Pi core `edit` + `pi-mono-multi-edit` | Don't override the text lane; blitz uses **symbol anchors** only. |
| AST rewrite via ast-grep patterns | `@yofriadi/pi-ast` | Different angle: blitz owns symbol scope, direct-swap, marker splice, and fuzzy recovery, not ast-grep `pattern` DSL. |
| Hash-addressed line edits | `@yofriadi/pi-hashline-edit` | Line-level, complementary. |
| Diff viewer / tool-output UI | `pi-tool-codex` | blitz produces unified diff tails; `pi-tool-codex` renders them. |
| Output compaction, bash rewriting | `pi-rtk-optimizer` | Out of scope. |
| Fuzzy path / symbol discovery | `pi-fff` | blitz consumes path inputs, doesn't rediscover them. |
| Rollback / undo checkpointing | Pi core + `pi-rewind` / `pi-rewind-hook` | Pi-rollback deferred; blitz ships only single-depth per-file undo. |
| Hosted fast-apply models | Morph, Relace, Cursor fast-apply | Different: hosted, token cost still medium. |
| Open-source fast-apply (full) | **fastedit** (parcadei) | Direct inspiration. blitz drops the 1.7B model and ports the deterministic splice algorithm natively. |

Unique to blitz: **native tree-sitter AST scope + deterministic splice + marker resolution + structural query rewrite**, all without running a language model.

## 3. Repository split

```
codewithkenzo/blitz                              # Zig 0.16 CLI (MIT, standalone)
  src/main.zig                                     # std.process.Init entry, dispatch
  src/cli.zig                                      # arg parsing, JSON stdin helpers
  src/ast.zig                                      # tree-sitter integration (see §4.3)
  src/symbols.zig                                  # symbol resolve, scope extraction
  src/splice.zig                                   # deterministic text-match + direct-swap (Layer A)
  src/fuzzy.zig                                    # whitespace-insensitive + relative-indent recovery (v0.2, Layer B)
  src/queries.zig                                  # structural tree-sitter query rewrites (v0.2, Layer C)
  src/backup.zig                                   # SHA-keyed backup store + atomic write
  src/lock.zig                                     # per-file fcntl advisory lock
  src/fallback.zig                                 # host-LLM scope payload emitter
  grammars/tree-sitter-rust/{parser.c,scanner.c}   # vendored, MIT-compat
  grammars/tree-sitter-typescript/…
  grammars/tree-sitter-tsx/…
  grammars/tree-sitter-python/…
  grammars/tree-sitter-go/…
  build.zig
  build.zig.zon
  .zig-version                                     # pins 0.16.x stable (released 2026-04-13)
  LICENSE, README.md, NOTICE.md

codewithkenzo/pi-blitz                           # Pi extension (TS/Bun/Effect v4)
  index.ts                                         # default export, register v0.1 tools, Effect boundary
  src/errors.ts                                    # Data.TaggedError union
  src/tool-runtime.ts                              # Effect.runPromiseExit + Cause discrimination
  src/tools.ts                                     # tools → spawnCollect(blitz …)
  src/doctor.ts                                    # Effect.cached binary/version probe
  src/paths.ts                                     # canonical realpath + symlink escape guard
  src/mutex.ts                                     # Effect.acquireUseRelease per canonical path
  src/config.ts                                    # user/project .pi/pi-blitz.json loader
  src/telemetry.ts                                 # pi_blitz_metrics entry persist
  skills/pi-blitz/SKILL.md
  package.json                                     # optionalDependencies: @codewithkenzo/blitz-<platform>; peerDependencies: pi core/coding-agent
  README.md
```

Platform binary packages (precedent: esbuild, biome, rolldown, turbo):

```
@codewithkenzo/blitz-darwin-arm64
@codewithkenzo/blitz-darwin-x64
@codewithkenzo/blitz-linux-x64-musl
@codewithkenzo/blitz-linux-arm64-musl
@codewithkenzo/blitz-windows-x64
```

## 4. Zig 0.16 alignment (verified against 0.16.0 stable)

### 4.1 Entry + allocators

```zig
pub fn main(init: std.process.Init) !void {
    const gpa = init.gpa;
    const io = init.io;
    _ = gpa;
    _ = io;
}
```

- Default to `std.process.Init` ("Juicy Main") for the CLI: it provides `init.gpa`, `init.arena`, `init.io`, environment, and args via `init.minimal`. Source: https://codeberg.org/ziglang/zig/raw/tag/0.16.0/lib/std/process.zig
- `std.process.Init.Minimal` is valid only if blitz deliberately bootstraps runtime state itself; then create **`std.heap.DebugAllocator(.{}){}`** as root (`GeneralPurposeAllocator` is removed in 0.16) and a manual `std.Io.Threaded` (`.init(gpa, .{ ... })` or `.init_single_threaded` when concurrency/cancelation are not needed).
- **`std.heap.ArenaAllocator`** scoped per tool call — free-on-exit cheapness matters for a short-lived CLI.

### 4.2 I/O model

0.16 pushes `std.Io.Threaded` as the stable I/O path (`Io.Evented` is experimental; don't depend on it). Blocking filesystem/process/time/network APIs now take `std.Io` and primarily live under `std.Io.*` (`std.Io.Dir`, `std.Io.File`, etc.). Source: https://ziglang.org/download/0.16.0/release-notes.html#I-O-as-an-Interface

- Primary path: use `init.io` from `std.process.Init`; use manual `std.Io.Threaded` only when using `Init.Minimal`.
- `std.process.spawn` / `std.process.run` with `io` for subprocess (LSP in v1.1, git fallback in v0.2).
- `std.json` for `--edits` / `--file-edits` JSON payloads.
- `std.crypto.hash.sha2.Sha256` for backup keys.
- Atomic writes use `dir.createFileAtomic(io, path, .{ .replace = true })` (method form for `std.Io.Dir.createFileAtomic(dir, io, path, options)`), write through `File.Writer`, flush, then `atomic.replace(io)` with `defer atomic.deinit(io)`. There is no `std.fs.Dir.atomicFile` / `write_buffer` API in 0.16. Sources: https://codeberg.org/ziglang/zig/raw/tag/0.16.0/lib/std/Io/Dir.zig and https://codeberg.org/ziglang/zig/raw/tag/0.16.0/lib/std/Io/File/Atomic.zig

### 4.3 tree-sitter integration

`@cImport` is flagged as future-deprecated in 0.16 release notes. Link tree-sitter the build-system way instead:

```zig
// build.zig (sketch, verified via tree-sitter/zig-tree-sitter and ziex-dev/ziex)
const ts_lib = b.addLibrary(.{
    .name = "tree-sitter",
    .root_module = b.createModule(.{ .target = target, .optimize = optimize }),
    .linkage = .static,
});
ts_lib.root_module.addCSourceFiles(.{
    .root = b.path("third_party/tree-sitter/lib/src"),
    .files = &.{ "lib.c" },
    .flags = &.{ "-std=c11" },
});
ts_lib.root_module.addIncludePath(b.path("third_party/tree-sitter/lib/include"));
ts_lib.root_module.link_libc = true;

for (grammars) |g| {
    ts_lib.root_module.addCSourceFile(.{
        .file = b.path(b.fmt("grammars/tree-sitter-{s}/src/parser.c", .{g})),
        .flags = &.{ "-std=c11" },
    });
}

const exe = b.addExecutable(.{
    .name = "blitz",
    .root_module = b.createModule(.{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    }),
});
exe.root_module.linkLibrary(ts_lib);
exe.root_module.addIncludePath(b.path("third_party/tree-sitter/lib/include"));
b.installArtifact(exe);
```

Key rule: `addCSourceFile`, `linkSystemLibrary`, `addIncludePath`, `link_libc = true`, etc. are invoked on `root_module` (via `b.createModule`) in 0.16, not on the `Compile` step directly. Bindings come from a tiny checked-in `extern` Zig module or an `addTranslateC` build step; do not use `@cImport`. Source: https://codeberg.org/ziglang/zig/raw/tag/0.16.0/lib/std/Build/Module.zig

### 4.4 Cross-compile matrix

```bash
zig build -Dtarget=aarch64-macos
zig build -Dtarget=x86_64-macos
zig build -Dtarget=x86_64-linux-musl
zig build -Dtarget=aarch64-linux-musl
zig build -Dtarget=x86_64-windows-gnu
```

Targets resolved via `standardTargetOptions`. Zig's cross-compile is built-in; no Docker, no `cross`, no system toolchains.

### 4.5 Dev ergonomics

- **`.zig-version`** at repo root pins 0.16.0 for external version managers; Zig itself does not read it.
- **`zig build -fincremental --watch`** for sub-second rebuild cycles (official 0.16 release-note spelling).
- **`zig build --fork=/abs/path/to/grammar-repo`** to sideload a local grammar fork during dev.

## 5. Language support (v0.1)

5 vendored grammars, all MIT-compatible:

| Language | Grammar repo |
|---|---|
| TypeScript + TSX | `tree-sitter/tree-sitter-typescript` |
| Python | `tree-sitter/tree-sitter-python` |
| Rust | `tree-sitter/tree-sitter-rust` |
| Go | `tree-sitter/tree-sitter-go` |

Each vendored at a specific tagged release into `grammars/`; upgrades explicit. Unsupported language → `blitz edit` returns the host-LLM scope payload (see §7.3) rather than erroring.

## 6. CLI surface

### 6.1 v0.1 commands (ship target)

| Command | Args | Description |
|---|---|---|
| `blitz read <file>` | path | AST structure summary. Files ≤100 lines → full content. Files with unsupported language → line count + note. |
| `blitz edit <file> --snippet - --after \| --replace <symbol>` | path + stdin snippet | Symbol-anchored edit; deterministic splice first, direct-swap fallback. |
| `blitz batch-edit <file> --edits -` | path + stdin JSON | `[{ snippet, after\|replace, … }, …]` applied sequentially. |
| `blitz rename <file> <old> <new> [--dry-run]` | — | AST-verified single-file rename; skips strings/comments/docstrings; writes unified-diff tail. |
| `blitz undo <file>` | — | Revert last backup; writes diff tail. |
| `blitz doctor` | — | Version, supported grammars, tree-sitter lib version, backup cache health. |

### 6.2 v0.2 additions (gap closure)

| Command | Description |
|---|---|
| `blitz multi-edit --file-edits -` | Cross-file edits in one pass. |
| `blitz rename-all <root> <old> <new> [--dry-run] [--only kind]` | Cross-file AST-verified rename walker. `--dry-run` is the default. Real writes require explicit `--apply`. |
| `blitz query <file> --pattern '<ts-query>' --rewrite '<template>'` | Raw structural rewrite using tree-sitter query DSL. Exposes Layer C directly. |

### 6.3 Deferred / never

Deferred to v0.3: `move`, `delete`, `move-to-file`.
Never in blitz: full-file rewrites (host uses core `edit`/`write`), unanchored structural changes (host gets scope payload).

### 6.4 Exit codes (fastedit-compatible)

- `0` success.
- `1` generic failure (missing file, parse error, no refs, no backup).
- `2` reserved for future `delete` cross-file-callers refusal.
- `124` timeout / external `AbortSignal` abort (matches `shared/subprocess.ts::spawnCollect`; stdin support does not alter exit-code mapping).

### 6.5 Error taxonomy (text stdout, not JSON)

Stdout signal matchers, exit 0:
- `Applied edit to <file>. latency: <n>ms, …` → plain success
- `Renamed '<old>' -> '<new>' in <file>: <n> replacement(s)` → plain success
- `Reverted <file> to previous state.` → plain success
- `No backup recorded for <file>.` → success + status `no-backup`
- `No changes detected in <file>.` → success + status `no-changes`
- `Warning: merged output has parse errors. Wrote anyway.` → success + advisory
- `needs_host_merge` JSON single line → Layer D scope payload fallback (see §7.3)

Stderr on exit 0 is ignored (keeps space for banners/logs without polluting signal).

## 7. Core edit algorithm

### 7.1 Pipeline

```
1. canonical path: realpath; reject escapes from cwd; SHA-key includes realpath+mtime
2. parse current file with tree-sitter
   - cache tree per { realpath, mtime_ns }
   - on subsequent edits, call ts_tree_edit before re-parse (incremental reuse)
3. resolve target symbol
   - exact match on node @name capture
   - scope by kind hint (function / class / method / variable)
   - miss → stderr "symbol not found, available: [...]", exit 1
4. extract target node byte range + ~3 lines of sibling context
5. classify snippet
   a. no markers → direct swap
   b. has `// ... existing code ...` / `# @keep` / language variant → Layer A splice
6. apply edit (ladder)
   Layer A: exact text-match splice of new lines between matched context anchors
   Layer B (v0.2): whitespace-insensitive + relative-indent + blank-strip + DMP fallback
   Layer C (v0.2): compile patch IR to tree-sitter query + rewrite
   Layer D: emit scope payload JSON, exit 0 (host performs the edit)
7. post-write validation
   - re-parse merged file
   - if original parsed clean and merged has new errors, revert + emit diagnostic
8. atomic write
   - `dir.createFileAtomic(io, path, .{ .replace = true })`
   - write/flush through `File.Writer`; sync file when durability mode is enabled; `atomic.replace(io)`; `defer atomic.deinit(io)`
9. backup store
   - key = sha256(realpath + "\0" + pre_edit_mtime_ns)
   - single-depth undo per path
10. stdout success line + optional unified-diff tail
```

### 7.2 Performance patterns (verified against tree-sitter C API)

- **Incremental parse reuse.** Keep last `TSTree` per file, call `ts_tree_edit(tree, &edit)` with exact byte + point deltas before `ts_parser_parse(parser, old_tree, input)` (arity 3; `ts_parser_parse_string` is the 4-arg string helper).
- **Query cache + cursor reuse.** Compile `TSQuery` objects once per `{language, pattern}` and reuse `TSQueryCursor`; call `ts_query_cursor_exec` for each run, then narrow with `ts_query_cursor_set_byte_range`, `ts_query_cursor_set_point_range`, `ts_query_cursor_set_max_start_depth`.
- **Node re-fetch after edit.** Do not trust pre-edit `TSNode` ranges after `ts_tree_edit`; nodes fetched from the tree after the edit reflect updated positions. Call `ts_node_edit(&node, &edit)` only when intentionally keeping a pre-edit node handle; otherwise re-query. Source: https://raw.githubusercontent.com/tree-sitter/tree-sitter/master/lib/include/tree_sitter/api.h
- **Byte-level fuzzy on ASCII windows.** Levenshtein on bytes when the window is ASCII; codepoint-aware only when multi-byte chars are present. Bit-parallel `O([n/64]·m)` for short windows.
- **Relative-indent normalization before diff.** Strip common leading whitespace → compare → reapply. Matches Aider's ladder; preserves alignment while enabling exact string match.
- **Structured rewrite IR, not free-text.** Compile edit intents to tree-sitter captures + rewrite templates; edit target is a node span, not a full file.

### 7.3 Layer D: host-LLM scope payload

When Layers A, B, C all fail, emit a compact JSON object to stdout (single line, exit 0) and let the host agent call its own `edit` tool:

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
  "siblingBefore": "private validate(req: Request): void { … }",
  "siblingAfter": "private logResponse(res: Response): void { … }",
  "excerpt": "…target node body, ≤35 lines…"
}
```

Target: fallback-path token cost **~60-80% less than a full-file replay** (hypothesis; see §10).

## 8. Input format — snippet markers

Strict grammar to minimize ambiguity vs fastedit's lenient marker dialect. Accept exactly these forms:

- **Full-replace** (no markers): snippet IS the new symbol body; direct swap.
- **Preserve-with-markers**, exactly one of:
  - `// ... existing code ...` / `# ... existing code ...` / `/* ... existing code ... */` (fastedit-compatible, auto-detected by language)
  - `// @keep` / `# @keep` (strict, recommended)
  - `// @keep lines=N` / `# @keep lines=N` (numeric anchor, least ambiguous)

Rationale per `blitz-perf-patterns.md` research: Morph, Relace, Aider, Continue all rely on lazy edit markers; explicit grammar removes the ambiguity upfront → deterministic Layer A coverage goes up without needing a model.

## 9. Pi extension — `@codewithkenzo/pi-blitz`

Effect v4 patterns verbatim from `extensions/flow-system` (same repo). The wrapper is backend-agnostic; blitz is just the `spawnCollect` target. Effect stays internal; Pi tool `execute` is the Promise/`AgentToolResult` boundary.

### 9.1 Tool surface (v0.1 = 6 tools)

| Pi tool | blitz command |
|---|---|
| `pi_blitz_read` | `blitz read <file>` |
| `pi_blitz_edit` | `blitz edit <file> --snippet - --after\|--replace <symbol>` |
| `pi_blitz_batch` | `blitz batch-edit <file> --edits -` |
| `pi_blitz_rename` | `blitz rename <file> <old> <new>` |
| `pi_blitz_undo` | `blitz undo <file>` |
| `pi_blitz_doctor` | `blitz doctor` |

v0.2 adds `pi_blitz_multi`, `pi_blitz_rename_all`, `pi_blitz_query`.

Register each with `pi.registerTool({ name, parameters, execute(toolCallId, params, signal, onUpdate, ctx) })`; `execute` returns `Promise<AgentToolResult<BlitzDetails>>` for friendly results or throws for hard tool failure.

### 9.2 Effect v4 shape

Typed error union via `Data.TaggedError` (class extends `Data.TaggedError("Tag")<{ ... }> {}`; no trailing `()` in repo/Bun style):

- `InvalidParamsError`, `ConfirmRequiredError` — schema / runtime guard
- `BlitzTimeoutError` — exit 124
- `BlitzMissingError` — ENOENT on binary
- `BlitzVersionError` — doctor below version floor
- `PathEscapeError` — canonical-path rejection
- `BlitzSoftError` — soft fastedit-style recoverable states

Boundary runner uses `Effect.runPromiseExit`, `Exit.isFailure`, and `Cause.findErrorOption(exit.cause)` (`Cause.failureOption` does not exist in `effect@4.0.0-beta.48`). Friendly soft errors return `AgentToolResult` text with `isError: true` + `details`; hard failures throw from `execute` because pi-mono only treats thrown errors as the hard tool-failure channel. Source: https://unpkg.com/effect@4.0.0-beta.48/dist/Cause.d.ts

Per-path mutex via `Effect.acquireUseRelease`. Doctor cache via module-level `Map<cacheKey, Effect.Effect<DoctorInfo, BlitzVersionError | BlitzMissingError>>`; on cache miss, run `Effect.cached(probeBinary(...))` once and store the returned inner cached effect. `Effect.cached` itself is not keyed and has type `Effect<Effect<A, E, R>>`. Cache key is `sha256(cwd::configHash::binary::mtime_ns)`; invalidate by deleting/replacing the map entry when binary mtime/config changes. Source: https://unpkg.com/effect@4.0.0-beta.48/dist/Effect.d.ts

### 9.3 TypeBox schemas

Caps per `@mariozechner/pi-coding-agent` conventions:
- Paths: `String({ minLength: 1, maxLength: 4096 })`, reject control bytes.
- Snippets: `String({ minLength: 1, maxLength: 65536 })`.
- Batch: `maxItems: 64`; aggregate 256 KB runtime guard.
- Multi: `maxItems: 32` files; aggregate 512 KB.
- Runtime guard rejects cases where both or neither of `after`/`replace` are set.
- `ConfirmRequiredError` gates destructive or trust-expanding writes (`undo`, `rename-all --apply`, external/trusted paths). No implicit writes outside canonical cwd.

### 9.4 Config

`~/.pi/pi-blitz.json` + `$(cwd)/.pi/pi-blitz.json`, same precedence model as `flow-system`. User-level only for `binary` override and `trustedExternalPaths`; project config cannot set those.

```ts
type PiBlitzConfig = {
  binary?: string;                 // user-only; absolute path
  trustedExternalPaths?: boolean;  // user-only
  defaultTimeoutMs?: number;       // default 30_000
  cacheDir?: string;               // override backup cache; default ~/.cache/blitz
  noUpdateCheck?: boolean;
};
```

## 10. Numbers — targets, not facts

All numeric claims below are **hypotheses** to be confirmed by the benchmark harness under `@codewithkenzo/pi-blitz/test/benchmark/`. Public data on AST-rewrite tools (ast-grep: 43ms-1s, srgn: ~1s for 450k lines, Comby: 187ms for 2591 LOC Go file) suggests our targets are reachable but not given.

| Metric | Pi core `edit` | fastedit (with model) | blitz v0.1 target | blitz v0.2 target (A+B+C) |
|---|---|---|---|---|
| Handled-case token savings | 0% | 50-54% (measured) | **target: 40-50%** | **target: 40-55%** |
| Real-workload coverage | 100% | 100% | target: 70-85% | **target: 90-95%** |
| Fallback regression | n/a | n/a | 0% (Layer D → host `edit`) | 0% |
| Weighted aggregate savings | 0% | ~50% | target: 30-40% | **target: 40-50%** |
| Wall-time deterministic path | <1 ms (in-process) | ~95 ms | target: <20 ms | target: <20 ms |
| Wall-time fallback | n/a | ~500 ms (local model) | host `edit` round-trip | host `edit` round-trip |
| Binary + runtime deps | none | Python + MLX/vLLM + 3 GB model | **~4 MB static binary** | ~4 MB |

### 10.1 Benchmark matrix (10 cases)

1. Trivial insert (after symbol)
2. One-line substitution
3. Guard clause wrap (add try/except)
4. Function body expansion
5. Multi-hunk same file
6. Cross-file import update (v0.2)
7. Cross-file rename
8. Move function within file (v0.3)
9. Move symbol to new file (v0.3)
10. Delete symbol (v0.3)

Per case: `tokens_out`, `wall_ms`, `success`, `files_touched`, `model_calls`. Median of 5 reps. CI uses a stub binary; local + release gates use the real binary.

### 10.2 Go / no-go gate for v0.1

- **Go** if blitz cuts `tokens_out` ≥ 40% on 5/7 handled cases (1-5, 7) **and** ties or beats fastedit on wall-time.
- **No-go** if deterministic path coverage of cases 1-5 is below 90% structurally correct.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Zig 0.16 API surface still shifting post-0.16.0 (.1/.2 minor bumps) | Pin `.zig-version`; track release notes; gate upgrades through CI |
| `@cImport` deprecation removes a fallback path | Build-system C integration is primary; `@cImport` not used in v0.1 |
| tree-sitter grammar divergence across languages | Vendor specific tagged versions; upgrade via explicit commits |
| Cross-compile CI breakage on a target | Per-target matrix on every PR; release gated on all green |
| Fuzzy match false positives | Bounded search window; confidence threshold; refuse-over-repair on ambiguous matches |
| Single-depth undo surprises | Docs + `blitz doctor` explicitly state "last-only"; pair with pi-rewind for deeper history |
| Grammar license mixing | All target grammars MIT-compatible; NOTICE.md attribution |
| Aspirational latency targets | All numbers labeled hypothesis until benchmark runs |
| Agent writes unsupported snippet grammar | Error lists the accepted marker forms; Layer D scope payload is the escape hatch |

## 12. Open questions

1. **Name.** `blitz` (working title) vs alternatives (`fted`, `blaze`, `kenzo-edit`, `piedit`). Needs public-facing decision before repo init.
2. **Backup cache location.** `~/.cache/blitz/` vs `.blitz/` per-repo. Recommend user-cache + per-repo override via env.
3. **Ship Pi extension alpha before blitz prebuilt binaries.** Recommend: extension `0.0.1-alpha` builds blitz from source locally; public `0.1.0` gates on prebuilt matrix.
4. **v0.2 output channel.** Keep text stdout (LLM-friendly, fastedit-style) or add `--output json` flag for structured pi-blitz integration? Recommend text-only for v0.1; add `--json` in v0.2 if telemetry demands it.
5. **Layer D JSON shape** — freeze in v0.1 or keep exploratory for v0.2? Recommend freeze: any change breaks the host-LLM prompt template.

## 13. Sequence

| Sprint | Goal |
|---|---|
| Sprint 1 (week 1) | Zig skeleton, tree-sitter static link, `blitz read`, `blitz edit --after`, `blitz edit --replace` direct-swap (no markers), cross-compile CI green. |
| Sprint 2 (week 2) | Port Layer A (marker-aware deterministic splice), backup store, `blitz undo`, `blitz rename`, `blitz doctor`. |
| Sprint 3 (week 3) | `@codewithkenzo/pi-blitz` TS scaffold with Effect v4, 6-tool surface, doctor, telemetry, npm prebuilt matrix, first benchmark. |
| v0.2 (weeks 4-6) | Layer B (fuzzy recovery) + Layer C (structural tree-sitter queries) + `multi-edit` + `rename-all` + `query`. |
| v1.1 (later) | LSP refactor bridge, benchmark-proven latency targets, public release. |

## 14. References

External sources this design relies on (URLs frozen at research time):

- Zig 0.16.0 release notes: https://ziglang.org/download/0.16.0/release-notes.html
- Zig build system guide: https://ziglang.org/learn/build-system/
- Zig 0.16 `std.process.Init`: https://codeberg.org/ziglang/zig/raw/tag/0.16.0/lib/std/process.zig
- Zig 0.16 `std.Io` / atomic file APIs: https://codeberg.org/ziglang/zig/raw/tag/0.16.0/lib/std/Io.zig, https://codeberg.org/ziglang/zig/raw/tag/0.16.0/lib/std/Io/Dir.zig, https://codeberg.org/ziglang/zig/raw/tag/0.16.0/lib/std/Io/File/Atomic.zig
- Effect v4 beta.48 API declarations: https://unpkg.com/effect@4.0.0-beta.48/dist/Effect.d.ts, https://unpkg.com/effect@4.0.0-beta.48/dist/Cause.d.ts, https://unpkg.com/effect@4.0.0-beta.48/dist/Data.d.ts
- tree-sitter C API: https://raw.githubusercontent.com/tree-sitter/tree-sitter/master/lib/include/tree_sitter/api.h
- tree-sitter query DSL: https://tree-sitter.github.io/tree-sitter/using-parsers/queries/1-syntax.html
- Zig tree-sitter upstream reference: https://github.com/tree-sitter/zig-tree-sitter
- Aider splice algorithm reference: https://github.com/Aider-AI/aider/blob/main/aider/coders/search_replace.py
- Continue deterministic matcher: https://github.com/continuedev/continue/blob/main/core/edit/lazy/replace.ts
- Morph apply-model contract: https://docs.morphllm.com/api-reference/endpoint/apply
- Relace instant-apply contract: https://docs.relace.ai/api-reference/instant-apply/apply
- ast-grep performance notes: https://ast-grep.github.io/blog/optimize-ast-grep.html
- Comby FAQ (perf numbers): https://comby.dev/docs/faq

Internal (this repo):
- `pi-extension-surface-notes.md` — pi-mono ExtensionAPI reference (shared across plugins).
- `next-spec-synthesis.md` — master roadmap (plugin rows).
- `archive/` — prior drafts (fastedit wrapper, pi-rollback, first-pass review, ecosystem/positioning/overlap one-offs; kept for context only).
