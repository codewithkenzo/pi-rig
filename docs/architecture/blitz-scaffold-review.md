# blitz scaffold review

Scope: `/home/kenzo/dev/blitz` + `extensions/pi-blitz` against `docs/architecture/blitz.md`.

## Findings

- [BLOCKER] `/home/kenzo/dev/blitz/src/main.zig:15-19` uses APIs absent from Zig 0.16 stable: `std.process.argsAlloc`, `std.process.argsFree`, `io.getStdOut()`, `io.getStdErr()`. `stdout.print` / `stderr.print` at `main.zig:29` and `main.zig:44` also depend on that invalid handle shape. Proposed fix: use `init.minimal.args.toSlice(init.arena.allocator())`; use `std.Io.File.stdout()` / `.stderr()` with `writerStreaming(init.io, &buf)` or `std.Io.File.writeStreamingAll(file, init.io, bytes)`, then flush writer interfaces.

- [BLOCKER] `/home/kenzo/dev/blitz/src/cli.zig:50-53` uses removed/old `std.ArrayList.writer(std.testing.allocator)` style. Zig 0.16 unmanaged `std.ArrayList(u8)` has allocator-taking mutators, no `.writer(...)`. Proposed fix: test with `var out: std.Io.Writer.Allocating = .init(std.testing.allocator); defer out.deinit(); try printHelp(&out.writer); try std.testing.expect(out.written().len > 0);` or use `buf.print(...)`-style APIs.

- [MAJOR] `/home/kenzo/dev/blitz/build.zig:40-65` keeps tree-sitter + grammar static-link block commented out; `third_party/` and `grammars/` are placeholders only. Spec §4.3/§5 and ticket `d1o-qphx` acceptance require vendored tree-sitter core + 5 grammars linked through 0.16 `root_module` APIs. Proposed fix: keep `d1o-qphx` open; vendor sources, enable block, add include paths/license files, then CI build all targets.

- [MAJOR] `/home/kenzo/dev/blitz/.github/workflows/ci.yml:39-44` builds targets but does not smoke-run `blitz --version`; test step runs native `zig build test`, not target artifact validation. Ticket `d1o-qphx` says `blitz --version` runs on each platform. Proposed fix: add smoke step for runnable native targets (`zig-out/bin/blitz --version` / `.exe` on Windows runner) and use platform runners or explicit emulation where “runs on each platform” is required.

- [MAJOR] `extensions/pi-blitz/src/tools.ts:76-279` never imports or applies `makePathLocks`; `extensions/pi-blitz/src/mutex.ts:17-53` is only used by tests. Writes (`edit`, `batch`, `rename`, `undo`) therefore spawn concurrently for same canonical file, contrary to spec §9.2. Proposed fix: create module-level locks, canonicalize first, wrap write effects in `locks.withLock(abs, runBlitz(...))`; future multi-file tools use `withSortedLocks`.

- [MAJOR] `extensions/pi-blitz/src/tools.ts:81-189` relies on registered TypeBox schemas for path/snippet/item caps, but execute bodies do not re-check schema bounds before spawn; only batch aggregate has a runtime guard. Direct `execute(...)` calls or host-side validation drift can pass oversize snippets/symbols to subprocess stdin. Proposed fix: add explicit guards or `Value.Check` per tool before `canonicalize`/`runBlitz`; keep batch aggregate as byte-length guard.

- [MAJOR] `extensions/pi-blitz/src/tools.ts:177-189` does not validate each batch edit has exactly one of `after`/`replace`; spec §9.3 requires same runtime XOR guard as single edit. Proposed fix: loop through `params.edits`, reject both/neither with `InvalidParamsError`; compute aggregate with `new TextEncoder().encode(json).byteLength` instead of `json.length`.

- [MAJOR] `extensions/pi-blitz/src/tools.ts:43-70` maps every thrown spawn failure to `BlitzTimeoutError`; missing binary (`ENOENT`) becomes timeout, and exit `127` can become soft `blitz-error`. `extensions/pi-blitz/src/doctor.ts:43-89` has proper `BlitzMissingError` / `BlitzVersionError` logic but no tool uses it. Proposed fix: make `runBlitz` catch discriminate timeout/abort vs ENOENT; run `getDoctor(...)` before tool spawns or fold missing/version checks into `runBlitz` as hard errors.

- [MAJOR] `extensions/pi-blitz/index.ts:31-39` loads config but only uses `binary`; `trustedExternalPaths`, `defaultTimeoutMs`, `cacheDir`, and `noUpdateCheck` are ignored. `extensions/pi-blitz/src/paths.ts:20-24` supports `trusted`, but `tools.ts:72` always calls `canonicalize(raw, cwd)` with default `false`. Proposed fix: pass full config into tool defs, use configured timeouts/env/cache, and wire user-only `trustedExternalPaths` intentionally.

- [MAJOR] `extensions/pi-blitz/src/paths.ts:31-42` realpath + prefix guard blocks normal symlink escapes, but check happens in TS before child process opens/writes the path. Parent directory can be swapped after check and before `blitz` open, causing TOCTOU escape. Proposed fix: keep TS guard, but repeat canonical root check inside Zig CLI immediately before lock/write; prefer opening anchored dir/file handles with no-follow semantics where available, then atomic write from that checked handle.

- [MAJOR] `extensions/pi-blitz/test/smoke.test.ts:15-38` tests do not prove mutex correctness. Same-path test asserts only `order.length === 2`, not serialization/no overlap/order; sorted-lock test observes only body execution, not lock acquisition order. No test covers `runTool` soft/hard boundary behavior. Proposed fix: add deferred/latch effects to prove no overlap, instrument or expose acquisition order for sorted locks, and test `runTool` returns `isError` for `BlitzSoftError` but throws for hard tagged errors.

- [MINOR] `extensions/pi-blitz/src/doctor.ts:24-31` cache key omits binary `mtime_ns`, while spec §9.2 says `sha256(cwd::configHash::binary::mtime_ns)`. Replacing binary at same path can keep stale doctor result until TTL. Proposed fix: stat resolved binary and include `mtimeNs`/size in key, or invalidate map on binary/config change.

- [MINOR] `extensions/pi-blitz/src/mutex.ts:33-38` release path never deletes lock-map entries; every unique canonical path is retained forever. Proposed fix: store the `next` promise in acquire result and delete only if `locks.get(path) === tailForThisAcquire` after release, or use a small FIFO queue abstraction with cleanup.

- [MINOR] `extensions/pi-blitz/src/tools.ts:21-35` soft/success taxonomy is incomplete vs spec §6.5: stdout states (`No backup recorded`, `No changes detected`, `needs_host_merge` JSON) are returned as plain OK text with no `details.status` / `parseFallback`. Proposed fix: parse known stdout success lines and set structured details; for `needs_host_merge`, set `details.status = "needs_host_merge"` and `parseFallback = true`.

- [MINOR] `/home/kenzo/dev/blitz/src/fallback.zig:11-22` `ScopePayload` fields use snake_case (`byte_start`, `ancestor_kind`, etc.) while spec §7.3 and skill docs use camelCase JSON (`byteStart`, `ancestorKind`, etc.). Proposed fix: either freeze Zig JSON names to camelCase via explicit serializer or update spec/skill before any payload ships.

- [MINOR] `shared/subprocess.ts:125-129` stops reading a stream once `maxOutputBytes` is reached but does not cancel/drain it. A noisy child can block on a full pipe until timeout. Proposed fix: keep draining and discard after cap, or cancel reader and kill child with a clear “output cap exceeded” result.

- [NIT] `extensions/pi-blitz/src/config.ts:37` has stale `eslint-disable-next-line @typescript-eslint/no-explicit-any`; no `any` exists on the next line. AGENTS ban (`as any`, `@ts-ignore`, `@ts-expect-error`) is not violated, but comment is misleading. Proposed fix: remove suppression or replace with typed copy helper.

## Verified OK

- `docs/architecture/blitz.md` was used as canonical spec; `/home/kenzo/dev/blitz/docs/blitz.md` is only pointer mirror, not source of truth.
- `extensions/pi-blitz/package.json` uses Effect `4.0.0-beta.48`, TypeBox, Bun scripts, and peer deps for both `@mariozechner/pi-agent-core` / `@mariozechner/pi-coding-agent`.
- `Data.TaggedError` class style in `extensions/pi-blitz/src/errors.ts` matches installed `effect@4.0.0-beta.48` declarations; no trailing `()` needed.
- `Cause.findErrorOption` exists and `Cause.failureOption` does not in installed Effect v4; `runTool` uses correct extractor.
- `Effect.cached` signature is `Effect<Effect<A, E, R>>`; `doctor.ts` extracts and stores inner effect correctly for a cache entry.
- No `as any`, `@ts-ignore`, `@ts-expect-error`, or `@cImport` found in reviewed source.
- TypeScript verification: `bun tsc --noEmit --pretty false` in `extensions/pi-blitz` passed; repo `bun run typecheck` passed.
- `bun test` in `extensions/pi-blitz` passed, but coverage is smoke-only per findings above.
- `shared/subprocess.ts` uses argv array spawning, supports stdin piping, closes stdin, and maps abort/timeout to exit `124`.
- Zig `build.zig` uses 0.16 `b.createModule`, `root_module`, `addRunArtifact`, and module-level C integration style in the commented block; no 0.15-only build-step C APIs spotted there.
- Local Zig is `0.15.2`; no local `zig build` validation was run against the 0.16-target scaffold.

## Next-ticket readiness

- `d1o-qphx`: needs-fixes-first — Zig 0.16 API blockers in `main.zig` / `cli.zig`, plus tree-sitter vendoring/static link and CI smoke still incomplete.
- `d1o-mq74`: needs-fixes-first — TS typecheck/tests are green, but mutex, config, doctor/error taxonomy, runtime caps, and boundary tests are not wired to spec yet.
