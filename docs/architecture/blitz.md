# blitz — Zig 0.16 AST-aware fast-edit CLI + `@codewithkenzo/pi-blitz` Pi extension

Single source of truth. Supersedes and absorbs `blitz-design.md`, `blitz-gap-closure.md`, `blitz-perf-patterns.md`, `pi-edit-positioning.md`, `pi-edit-ecosystem-compare.md`, `pi-edit-local-overlap.md`, `zig-0.16-verification.md` (all archived).

Status: **`0.1.0-alpha.10`.** Standalone `codewithkenzo/blitz` CLI, npm platform packages, MCP stdio server, and `@codewithkenzo/pi-blitz` are published. Structured apply IR (`blitz apply`) is implemented. MCP stdio server ships as `blitz-mcp` with a Node entrypoint and workspace guard. Linux x64 has been smoke-tested locally; macOS and Windows packages are published but still need runtime smoke verification. Authentic Pi/model benchmarks show meaningful reductions in provider output tokens, tool-call argument tokens, wall time, and cost on handled symbol edits (see §10). Freeform `snippet` ergonomics are less reliable than structured operations for large bodies; structured apply tools are the preferred Pi-facing API.

## 1. North star

Ship an AST-aware edit CLI that preserves fastedit's **output-token savings** and removes its runtime drag:

- **Zero local ML model** — no MLX, no vLLM, no 1.7B Qwen.
- **Zero interpreter** — single static Zig 0.16 binary, target 3-5 MB; see §10 for current evidence.
- **Zero Python** — nothing to install besides the binary.
- **Cold-call latency target:** sub-20 ms deterministic path. Internal debug/musl runs are roughly 12-13 ms median; release-mode public numbers reflect benchmark runs in §10.
- **MIT**, Kenzo-owned. Alpha package ships a Node wrapper, MCP bridge, and native platform packages. `BLITZ_BIN` remains an override for custom/source builds.

The extension (`@codewithkenzo/pi-blitz`) is a thin Effect v4 wrapper around the binary.


## 1.1 Structured apply IR

### Problem

The v0.1 LLM-facing API is too freeform:

```ts
pi_blitz_edit({ file, replace: "symbolName", snippet: "..." })
```

Models must infer whether `snippet` means a whole declaration, body-only replacement, marker splice, one-line span replacement, body wrap, or preserved islands. Real Pi benches with `gpt-5.4-mini` showed:

- small symbol rewrite can win (observed: 50.6% fewer tool-call arg tokens and 38.7% fewer output tokens vs core edit on one fixture),
- unique one-line edits are already near-optimal in core `edit`,
- medium/huge freeform snippets often repeat too much unchanged code unless heavily guided.

The release-facing API therefore centers on structured deterministic edit operations. Freeform `snippet` editing remains available, but Pi-facing tools should prefer narrow structured operations for large bodies and multi-step symbolic edits.

### Design rule

Structured apply moves the model from writing replacement bodies to selecting a compact operation enum plus changed text/anchors. Blitz owns AST scope, body extraction, indentation, validation, backup, and write.

### New canonical command

```bash
blitz apply --edit - --json [--dry-run] [--diff]
```

Request shape:

```ts
type BlitzApplyRequest = {
  version: 1;
  file: string;
  operation:
    | "replace_body_span"
    | "insert_body_span"
    | "wrap_body"
    | "compose_body"
    | "insert_after_symbol"
    | "set_body"
    | "multi_body"
    | "patch";
  target: {
    symbol: string;
    kind?: "function" | "method" | "class" | "variable" | "type";
    range?: "body" | "node";
  };
  edit: object;
  options?: {
    dryRun?: boolean;
    requireParseClean?: boolean;
    requireSingleMatch?: boolean;
    diffContext?: number;
  };
};
```

Initial operation payloads:

```ts
type ReplaceBodySpan = {
  find: string;
  replace: string;
  occurrence: "only" | "first" | "last" | number;
};

type InsertBodySpan = {
  anchor: string;
  position: "before" | "after";
  text: string;
  occurrence: "only" | "first" | "last" | number;
};

type WrapBody = {
  before: string;
  keep: "body";
  after: string;
  indentKeptBodyBy?: number;
};

type ComposeBody = {
  segments: Array<
    | { text: string }
    | { keep: "body" }
    | { keep: { beforeKeep?: string; afterKeep?: string; includeBefore?: boolean; includeAfter?: boolean; occurrence?: "only" | "first" | "last" | number } }
  >;
};

type InsertAfterSymbol = { code: string };
type SetBody = { body: string; indentation?: "preserve" | "normalize" };
```

Examples that must stay tiny:

```json
{
  "version": 1,
  "file": "huge.ts",
  "operation": "replace_body_span",
  "target": { "symbol": "hugeCompute" },
  "edit": { "find": "return total;", "replace": "return total + 1;", "occurrence": "last" }
}
```

```json
{
  "version": 1,
  "file": "medium.ts",
  "operation": "wrap_body",
  "target": { "symbol": "mediumCompute" },
  "edit": {
    "before": "try {\n",
    "keep": "body",
    "after": "\n} catch (error) {\n  console.error(error);\n  throw error;\n}",
    "indentKeptBodyBy": 2
  }
}
```

### Pi extension v0.2 surface

Prefer one schema first:

```ts
pi_blitz_apply({ file, operation, target, edit, dryRun?, includeDiff? })
```

If authentic Pi benches show model confusion with the union-shaped `edit` field, split into narrow tools:

- `pi_blitz_replace_body_span`
- `pi_blitz_insert_body_span`
- `pi_blitz_wrap_body`
- `pi_blitz_compose_body`
- `pi_blitz_multi_body`
- `pi_blitz_patch`

### Failure and validation policy

- Exact matching only by default.
- `requireSingleMatch` defaults true unless `occurrence` is specified.
- Missing/ambiguous anchors reject with no mutation.
- Current file parse-clean + candidate parse-error => reject with no mutation.
- `dryRun` and apply use the same engine.
- Result JSON must include `status`, `operation`, `validation`, `ranges`, compact `diffSummary`, and metrics. Full diff is opt-in.

### Benchmark reporting discipline

Use real Pi/model sessions for product claims. Failed or incorrect rows stay in reports and are counted in correctness rate. Public docs must separate:

- provider `usage.output`,
- tool-call argument tokens,
- tokenizer used,
- correctness rate,
- malformed call/retry rate,
- wall time,
- cost.

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
  src/splice.zig                                   # deterministic marker splice (Layer A; 5.5-reviewed local pass)
  src/fuzzy.zig                                    # whitespace-insensitive + relative-indent recovery (v0.2, Layer B)
  src/queries.zig                                  # structural tree-sitter query rewrites (v0.2, Layer C)
  src/backup.zig                                   # SHA-keyed backup store + atomic write
  src/lock.zig                                     # per-file mkdir lock with stale cleanup
  src/fallback.zig                                 # planned host-LLM scope payload emitter
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
  index.ts                                         # default export, register Pi tools, Effect boundary
  src/errors.ts                                    # Data.TaggedError union
  src/tool-runtime.ts                              # Effect.runPromiseExit + Cause discrimination
  src/tools.ts                                     # tools → spawnCollect(blitz …)
  src/doctor.ts                                    # Effect.cached binary/version probe
  src/paths.ts                                     # canonical realpath + symlink escape guard
  src/mutex.ts                                     # Effect.acquireUseRelease per canonical path
  src/config.ts                                    # user/project .pi/pi-blitz.json loader
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
1. canonical path: realpath; reject escapes from cwd; backup key currently single-depth per realpath
2. parse current file with tree-sitter
   - cache tree per { realpath, mtime_ns }
   - on subsequent edits, call ts_tree_edit before re-parse (incremental reuse)
3. resolve target symbol
   - exact match on declaration/name capture, not arbitrary call-site identifiers
   - scope by kind hint (function / class / method / variable)
   - declaration nodes must win over reference identifiers; call-site replacement is not a valid v0.1 edit target
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
   - key = sha256(realpath)
   - single-depth undo per path; a second edit overwrites the prior backup snapshot
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

Target: fallback-path token cost significantly less than a full-file replay; exact numbers depend on symbol body size relative to file.

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


### 9.1 Tool surface (v0.2 stream UX)

| Pi tool | blitz command | Notes |
|---|---|---|
| `pi_blitz_read` | `blitz read <file>` | AST/source summary; read-only; no progress updates. |
| `pi_blitz_edit` | `blitz edit <file> --snippet - --after\|--replace <symbol>` | Legacy symbol edit surface. |
| `pi_blitz_batch` | `blitz batch-edit <file> --edits -` | Legacy batch edit surface. |
| `pi_blitz_apply` | `blitz apply --edit - --json` | Canonical structured JSON IR. |
| `pi_blitz_replace_body_span` | `blitz apply --edit - --json` | Narrow wrapper for exact body-span replacement. |
| `pi_blitz_insert_body_span` | `blitz apply --edit - --json` | Narrow wrapper for body-span insertion. |
| `pi_blitz_wrap_body` | `blitz apply --edit - --json` | Narrow wrapper for whole-body wrapping. |
| `pi_blitz_compose_body` | `blitz apply --edit - --json` | Narrow wrapper for preserve-island body composition. |
| `pi_blitz_multi_body` | `blitz apply --edit - --json` | Multiple body-scoped edits in one file. |
| `pi_blitz_patch` | `blitz apply --edit - --json` | Compact tuple patch ops. |
| `pi_blitz_try_catch` | `blitz apply --edit - --json` | Patch tuple helper for try/catch wrapping. |
| `pi_blitz_replace_return` | `blitz apply --edit - --json` | Patch tuple helper for return replacement. |
| `pi_blitz_rename` | `blitz rename <file> <old> <new>` | Single-file AST rename. |
| `pi_blitz_undo` | `blitz undo <file>` | Last-edit rollback; requires explicit confirm. |
| `pi_blitz_doctor` | `blitz doctor` | Binary/version/cache diagnostics. |

Diff output is opt-in. The canonical wire field is `options.diffContext`; Pi also accepts top-level `diff_context` as an LLM-friendly alias. Both are honored only when `include_diff` / `options.includeDiff` is true; otherwise no `--diff` flag or `options.diffContext` is sent.

Register each with `pi.registerTool({ name, parameters, renderCall, renderResult, execute(toolCallId, params, signal, onUpdate, ctx) })`; `execute` returns `Promise<AgentToolResult<BlitzDetails>>` for friendly results or throws for hard tool failure.

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

`~/.pi/pi-blitz.json` can point the extension at a specific `blitz` binary. Project config is read for future compatibility, but `binary` is user-only and cannot be overridden from `$(cwd)/.pi/pi-blitz.json`.

```ts
type PiBlitzConfig = {
  binary?: string; // user-only; absolute path or command name for blitz
};
```

### 9.5 MCP stdio server

`blitz-mcp` is a self-contained MCP server (JSON-RPC over stdio, protocol `2025-06-18`). The published package exposes a Node entrypoint (`mcp/blitz-mcp.js`) and keeps `mcp/blitz-mcp.ts` as source. Use it for MCP-capable hosts (Claude Desktop, Claude Code, Cursor, Codex, etc.).

**Tools:**

| MCP tool | blitz command | Description |
|---|---|---|
| `blitz_doctor` | `blitz doctor` | Binary version, supported grammars, cache health. |
| `blitz_read` | `blitz read <file>` | AST/source summary. |
| `blitz_patch` | `blitz apply --edit -` (`patch` op) | Compact patch tuple array (`replace`, `insert_after`, `wrap`, `replace_return`, `try_catch`). |
| `blitz_try_catch` | `blitz apply --edit -` (`patch/try_catch` op) | Wrap symbol body in try/catch. |
| `blitz_replace_return` | `blitz apply --edit -` (`patch/replace_return` op) | Replace a return expression in a symbol body. |
| `blitz_undo` | `blitz undo <file>` | Revert last mutation. |

**Primary MCP setup examples:**

Claude Code CLI:

```bash
claude mcp add --transport stdio blitz -- npx --yes --package=@codewithkenzo/blitz -- blitz-mcp --workspace "$PWD"
```

Claude Code JSON (`.mcp.json`):

```json
{
  "mcpServers": {
    "blitz": {
      "command": "npx",
      "args": ["--yes", "--package=@codewithkenzo/blitz", "--", "blitz-mcp", "--workspace", "/absolute/path/to/your/project"]
    }
  }
}
```

VS Code (`mcp.json`):

```json
{
  "servers": {
    "blitz": {
      "type": "stdio",
      "command": "npx",
      "args": ["--yes", "--package=@codewithkenzo/blitz", "--", "blitz-mcp", "--workspace", "${workspaceFolder}"]
    }
  }
}
```

Codex (`~/.codex/config.toml` or `.codex/config.toml`):

```toml
[mcp_servers.blitz]
command = "npx"
args = ["--yes", "--package=@codewithkenzo/blitz", "--", "blitz-mcp", "--workspace", "/absolute/path/to/your/project"]
```

MCP clients launch Blitz as a local subprocess and speak JSON-RPC over stdin/stdout. `--workspace` is the project root Blitz may read/write. Use `BLITZ_BIN` only for custom/source builds.

### 9.6 Environment variables

| Variable | Default | Description |
|---|---|---|
| `BLITZ_BIN` | `blitz` (PATH) | Binary used by the MCP server and `bin/blitz.js` npm wrapper. |
| `BLITZ_WORKSPACE` | required | Workspace root for MCP path resolution. All file arguments are resolved relative to this directory and rechecked by the Zig CLI. |
| `BLITZ_MCP_TIMEOUT_MS` | `30000` | Per-call timeout in ms for MCP subprocess invocations. |
| `BLITZ_MCP_MAX_FRAME_BYTES` | `1048576` | Maximum JSON-RPC frame size in bytes. |

### 9.7 Workspace safety

The MCP server enforces a path escape guard: every file argument is resolved via `path.resolve(BLITZ_WORKSPACE, file)` and rejected with an error if the result is outside `BLITZ_WORKSPACE`. The server also passes `--workspace-root` to the Zig CLI so the native layer rechecks real paths before reads/writes.

The Pi extension enforces the same guard via `src/paths.ts` (`canonicalRealpath` + symlink check against canonical cwd).

## 10. Numbers — benchmark evidence

Internal `bench/run.ts` asserts golden output bytes before reporting performance. Two authentic Pi/model benchmark runs with `gpt-5.4-mini` are on record. All metrics below are from actual provider API calls, not byte/4 estimates, unless noted.

**CLI review (2026-04-27, commits `2962aa0` + `b55d35d`):**

- `zig build test -Dtarget=x86_64-linux-musl --summary all`: **54/54 tests passed**.

**Benchmark 1 — medium-10k / wrap_body, N=5, both lanes 100% correct:**

| Metric | pi core `edit` | `pi_blitz_wrap_body` | Reduction |
|---|---|---|---|
| Provider output tokens (median) | 9,639 | 85 | **99.1%** |
| Tool-call arg tokens (median) | 9,624 | 65 | **99.3%** |
| Wall time (median) | ~61,699 ms | ~3,919 ms | **93.6%** |
| Cost (sum, N=5) | $0.2453 | $0.0321 | **86.9%** |

Both lanes were 100% correct. Reductions reflect savings on a handled case where both approaches produced correct output.

**Benchmark 2 — multi / large-structural, N=5:**

Core attempt: 0% correct, median provider output 9,739 tokens, tool-call args 9,689 tokens, wall ~86,839 ms, cost sum $0.2972.

`pi_blitz_patch` (restricted structured ops, after normalization): 100% correct, median provider output 108 tokens, tool-call args 89 tokens, wall ~3,211 ms, cost sum $0.0310.

Reductions vs core attempt (correctness + efficiency, not both-correct savings):

| Metric | Reduction |
|---|---|
| Provider output tokens | **98.9%** |
| Tool-call arg tokens | **99.1%** |
| Wall time | **96.3%** |
| Cost | **89.6%** |

**Scope and caveats:**

- These benchmarks cover specific handled cases. Tiny or one-line edits often favor the core `edit` tool, which has zero spawn overhead.
- Blitz is most effective for large preserved bodies and structural symbolic edits.
- Claims distinguish: provider `usage.output` tokens, tool-call argument tokens, correctness rate, wall time, and cost.
- Wall time includes LLM round-trip, not binary-only. Binary-only spawn + parse + write is roughly 12-15 ms median internally.
- Public claims on additional cases will be gated on correctness parity first.

| Metric | Pi core `edit` | fastedit (with model) | blitz structured ops |
|---|---|---|---|
| Handled-case token savings | 0% | 50-54% | **86-99% (measured, handled cases)** |
| Coverage | 100% | 100% | high for symbol-scoped edits; fallback via Layer D |
| Fallback regression | n/a | n/a | 0% (Layer D → host `edit`) |
| Wall-time deterministic path | <1 ms (in-process) | ~95 ms | ~12-15 ms (binary spawn + parse + write) |
| Binary + runtime deps | none | Python + MLX/vLLM + 3 GB model | Native Zig binary; current platform packages are ~0.8-2.5 MB compressed |

### 10.1 Benchmark matrix

Planned coverage (status: two cases measured, remainder planned):

1. Trivial insert (after symbol)
2. One-line substitution
3. Guard clause wrap — `wrap_body` ✅ measured (Benchmark 1)
4. Function body expansion
5. Multi-hunk same file — `patch` ✅ measured (Benchmark 2)
6. Cross-file import update (v0.2)
7. Cross-file rename
8. Move function within file (v0.3)
9. Move symbol to new file (v0.3)
10. Delete symbol (v0.3)

Per case: `usage.output` (provider tokens), tool-call arg tokens, `wall_ms`, `success`, `files_touched`, `model_calls`. Median of 5 reps. CI uses a stub binary; local + release gates use the real binary.

### 10.2 Go / no-go gate for v0.1

- **Go** if blitz cuts `tokens_out` ≥ 40% on 5/7 handled cases (1-5, 7) **and** ties or beats fastedit on wall-time.
- **No-go** if deterministic path coverage of cases 1-5 is below 90% structurally correct.
- **No-go** if any marker case exits 0 but produces non-golden output.
- **No-go** if `edit --after` replaces instead of inserts, or if symbol resolution edits a call-site/reference before the declaration.

### 10.3 Extension review gate (passed — local Linux musl)

`@codewithkenzo/pi-blitz` is wired to the live binary for local testing. All gate items passed in `gpt-5.5` xhigh review:

1. `edit --after` inserts at `target.endByte()` and preserves original symbol.
2. `edit --replace` and `batch-edit` resolve declaration nodes before/without arbitrary identifiers.
3. Marker splice either produces golden output or fails closed without mutating disk.
4. Marker path re-parses/validates merged content enough to reject obvious corruption.
5. Batch replace has marker parity or explicit marker rejection.
6. `zig build test -Dtarget=x86_64-linux-musl --summary all` runs module tests, not just a single root test.
7. `bench/run.ts` asserts exact expected output bytes, splits direct-swap vs marker aggregates, and removes stale direct-swap-only caveats.
8. A fresh `gpt-5.5` xhigh read-only review returns PASS or PASS WITH FIXES. **Passed:** focused review returned PASS after `b55d35d`.

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
| Latency targets | Binary-only path measured ~12-15 ms internally; end-to-end wall time includes LLM round-trip |
| Agent writes unsupported snippet grammar | Error lists the accepted marker forms; Layer D scope payload is the escape hatch |

## 12. Open questions

1. **Backup cache location.** `~/.cache/blitz/` vs `.blitz/` per-repo. Recommend user-cache + per-repo override via env.
2. **v0.2 output channel.** Keep text stdout (LLM-friendly, fastedit-style) or add `--output json` flag for structured pi-blitz integration? Text-only for v0.1; add `--json` in v0.2 if telemetry demands it.
3. **Layer D JSON shape** — freeze in v0.1 or keep exploratory for v0.2? Recommend freeze: any change breaks the host-LLM prompt template.

**Resolved:**
- Name: `blitz`. Repo: `codewithkenzo/blitz`. npm: `@codewithkenzo/blitz`.
- Extension alpha ships before prebuilts: MCP server (`mcp/blitz-mcp.ts`) covers the tool surface for local use until `@codewithkenzo/pi-blitz` is published and prebuilt binaries land.

## 13. Sequence

| Sprint | Goal | Status |
|---|---|---|
| Sprint 1 | Zig skeleton, tree-sitter static link, `blitz read`, `blitz edit --replace`, `blitz edit --after`, initial CI/bench. | Done |
| Sprint 2 | Backup store, `blitz undo`, `blitz rename`, `blitz doctor`, Layer A marker splice, local `gpt-5.5` review. | Done |
| Sprint 3 | `@codewithkenzo/pi-blitz` wired to reviewed binary, MCP stdio server (`mcp/blitz-mcp.ts`), Pi-stream benchmarks, npm package (`0.1.0-alpha.0`). | Done |
| v0.2 | Layer B (fuzzy recovery) + Layer C (structural tree-sitter queries) + `multi-edit` + `rename-all` + `query`. npm prebuilt matrix. | Planned |
| v1.1 | LSP refactor bridge, full benchmark matrix, public stable release. | Planned |

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

Internal:
- Pi Rig `pi-extension-surface-notes.md` — pi-mono ExtensionAPI reference (shared across plugins).
- Pi Rig `roadmap.md` — master roadmap (plugin rows).
- `reports/archive/` — superseded benchmark/report snapshots kept for audit only.
