# pi-edit — fastedit integration (pre-implementation)

Draft contract for the `extensions/pi-edit/` package. Pre-implementation; no code yet.

## Goal

Expose [`parcadei/fastedit`](https://github.com/parcadei/fastedit) as a pi extension so tool calls produce AST-aware edits with 0–~40 output tokens per edit, instead of repeating old code in unified diffs / SEARCH-REPLACE.

This plugin replaces the previously planned `pi-diff` slot. The "structured delta review" intent is covered by `fastedit diff`.

## External prerequisites (user-installed)

1. `fastedit` (PyPI package `fastedits`, binaries: `fastedit`, `fastedit-hook`, `fastedit-mcp`)
   - Recommended install: `uv tool install 'fastedits[mlx,mcp]'` (Apple Silicon) or `uv tool install 'fastedits[vllm,mcp]'` (Linux/GPU) or `uv tool install 'fastedits[mcp]'` (external LLM)
   - Then `fastedit pull --model mlx-8bit` or `fastedit pull --model bf16`
2. `tldr` (from `parcadei/tldr-code`) on PATH — required for `pi_edit_read` / `pi_edit_search` (`fastedit read/search`)
3. One merge backend, chosen via `FASTEDIT_BACKEND`:
   - `mlx` (macOS only)
   - `vllm` (Linux + GPU)
   - `llm` (external OpenAI-compatible: LM Studio, llama.cpp OAI-shim, Ollama OAI-shim, vLLM server, TGI)

The extension does **not** bundle Python, MLX, vLLM, or the 1.7B model. Users install them out-of-band.

## Integration approach

**MVP: CLI subprocess wrapper.** Reasons:
- fastedit's MCP server is a facade only (it re-exports the same tool functions; no richer contract).
- pi-mono's `ExtensionAPI` does not ship an MCP client surface. Bridging stdio JSON-RPC would be a second project.
- Per-call latency of `uv tool`-installed `fastedit` is acceptable for v1 because the deterministic path returns in <10ms total.

**Not MVP:** `fastedit-mcp` persistent sidecar over stdio JSON-RPC. Revisit only if cold-start dominates the timing benchmark (§ Benchmark).

## Tool surface (MVP = 8 tools)

Selected from the 12 fastedit MCP tools. Each maps to a `fastedit` subcommand. Stdout is **text**, not JSON; parsing is line-matched. This contract intentionally adds `pi_edit_undo` beyond the 7-tool positioning list because dedicated `pi-rollback` is Deferred; it stays single-file only, requires explicit confirmation, and does not provide session rollback. All TypeBox params carry byte/item caps:
- `file`, `root`, `path`, `file_path`: `String({ minLength: 1, maxLength: 4096 })`, control-byte reject.
- `query`, `regex_filter`: `String({ minLength: 1, maxLength: 4096 })`, control-byte reject.
- `after`, `replace`, `old_name`, `new_name`: `String({ minLength: 1, maxLength: 512 })`, control-byte reject.
- `top_k`: integer, `minimum: 1`, `maximum: 100`, default `20`.
- `snippet`: `String({ minLength: 1, maxLength: 65536 })`.
- `edits[]`: `maxItems: 64`, aggregate payload capped at 256KB in runtime guard.
- `file_edits[]`: `maxItems: 32`, per-file `edits[]` capped at 64, aggregate 512KB.
- `after`/`replace` on the same call are exclusive: schema allows both optional but a runtime guard rejects when both or neither are set.

| Pi tool | fastedit CLI | TypeBox params |
|---|---|---|
| `pi_edit_read` | `fastedit read <file>` | `{ file: string }` |
| `pi_edit_search` | `fastedit search <query> [path] --mode ... --top-k ...` | `{ query: string; path?: string; mode?: "search"\|"regex"\|"hybrid"\|"references"; top_k?: number; regex_filter?: string }` |
| `pi_edit_diff` | `fastedit diff <file>` | `{ file: string }` |
| `pi_edit_apply` | `fastedit edit <file> --snippet - --after\|--replace SYMBOL` | `{ file: string; snippet: string; after?: string; replace?: string }` (exactly one of `after`/`replace`) |
| `pi_edit_batch` | `fastedit batch-edit <file> --edits -` | `{ file: string; edits: Array<{ snippet: string; after?: string; replace?: string }> }` |
| `pi_edit_multi` | `fastedit multi-edit --file-edits -` | `{ file_edits: Array<{ file_path: string; edits: Array<{ snippet: string; after?: string; replace?: string }> }> }` |
| `pi_edit_rename_all` | `fastedit rename-all <root> <old> <new> [--dry-run] [--only ...]` | `{ root: string; old_name: string; new_name: string; only?: "class"\|"function"\|"method"\|"variable"; dry_run?: boolean /* default true */; apply?: boolean; confirm?: boolean }` — real writes require `dry_run: false && apply: true && confirm: true`; otherwise tool always runs dry. Root is realpath-scoped under cwd. |
| `pi_edit_undo` | `fastedit undo <file>` | `{ file: string; confirm?: boolean }` — requires `confirm: true`; otherwise hard-fails. |

Deferred to v1.1: `pi_edit_delete`, `pi_edit_move`, `pi_edit_rename` (single-file), `pi_edit_move_to_file`.

## Subprocess contract

All calls go through `shared/subprocess.ts::spawnCollect`. **Done (2026-04-24)**: `spawnCollect` now accepts optional `stdin?: string | Uint8Array` and `signal?: AbortSignal`; both timeouts and external aborts map to exit code `124`.

Conventions:

- **Snippets / JSON lists always go via stdin (`--snippet -`, `--edits -`, `--file-edits -`).** Argv size caps and shell-quoting bugs avoided.
- **Canonical path policy (applies everywhere a `file`/`path`/`root` is accepted):**
  1. Reject empty, NUL, or control-byte paths at TypeBox layer.
  2. Resolve against `ctx.cwd` (falling back to `process.cwd()`) with `path.resolve`.
  3. `realpath` the result; reject unless `path.relative(realpath(ctx.cwd), targetRealpath)` is neither `..`-prefixed nor absolute. Do not use raw string `startsWith` prefix checks.
  4. Reject symlinks that escape the workspace unless `trustedExternalPaths: true` is set in user-level config (project config cannot set this).
  5. For git subprocesses, always pass paths after a `--` separator.
- `env`: start from `process.env`, strip non-whitelisted `FASTEDIT_*`, then set only whitelisted `FASTEDIT_*` derived from resolved config. Non-`FASTEDIT_*` env stays untouched.
- `cwd`: the canonical workspace cwd; never the user-supplied path.
- `timeoutMs`: default 60_000; `fast_edit` model path can take ~500ms, CI/vLLM cold-start more.
- `maxOutputBytes`: default 256KB.
- **Per-target lock**: every mutating tool acquires an in-process mutex keyed by canonical absolute path before spawn; concurrent calls on the same file serialize. `pi_edit_multi` acquires all target file locks in sorted canonical-path order. `pi_edit_rename_all` write mode acquires a root-scoped mutex keyed by canonical root.

### Error taxonomy (verified against `cli.py` 0.5.0)

Hard failures throw from `execute` (Effect-side `Effect.fail` of a tagged error → `runPromiseExit` discriminates at boundary). Recoverable fastedit states return text with `isError: true` plus structured `details`; callers branch on `details.reason` / `details.suggest`. True-success with advisory uses `details.warning` and **does not** set `isError`.

**Throw (hard failure):** tagged errors via `Data.TaggedError` in `src/types.ts`:
- `InvalidParamsError` — post-validation schema / runtime-guard failure
- `ConfirmRequiredError` — `confirm` missing on destructive tools
- `FasteditTimeoutError` — spawn exit 124 (timeout or external abort)
- `FasteditMissingError` — spawn ENOENT on `fastedit`
- `FasteditVersionError` — doctor shows version below floor
- `PathEscapeError` — canonical-path policy rejection

**Soft error (`isError: true`, structured `details`):**
- exit `1` + stderr matches `No undo history for <file>` (from `cmd_undo`) → `details.reason = "no-undo-history"`
- exit `1` + stderr matches `No occurrences of '<name>' found under <root>` (from `cmd_rename_all`) → `details.reason = "no-occurrences"`
- exit `1` + stderr matches `Error: no code references to '<name>'` (from `cmd_rename`) → `details.reason = "no-references"`
- exit `1` generic → `details.reason = "fastedit-error"`, include trimmed stderr; add `details.suggest` when deducible (e.g. swap `after`/`replace`).
- exit `2` from `cmd_delete` cross-file-callers → `details.requiresForce = true` (only when `pi_edit_delete` lands).

**Plain success (exit 0, no isError):**
- `Applied edit to <file>.` / `Applied <n> edits to <file>.` / `Renamed ...` / `Reverted <file> to previous state.` / `Moved ...` → verbatim stdout.
- `fastedit diff`: `No backup recorded for <file>.` and `No changes detected in <file>.` are printed to **stdout** and exit 0 → success with `details.status = "no-backup" | "no-changes"`.
- `fastedit search`: `No results found.` / `No references found.` → stdout + exit 0 → success with `details.status = "empty-results"`.
- `fastedit read`: if `tldr` missing, prints `<path> (<n> lines)` and exits 0 → success with `details.degraded = true`.
- exit `0` + stdout contains `Warning: merged output has parse errors. Wrote anyway.` (from `cmd_edit`) → success with `details.warning`, recommend `pi_edit_diff` follow-up.
- exit `0` + stdout contains `Warning: <n>/<m> chunk(s) rejected. Partial edit applied.` → success with `details.warning` and `details.partial = true`.

**Stderr noise rule:** On exit 0, stderr may contain fastedit's post-command update notice (`cli.py` → `update_check.get_update_notice()`). **Never treat exit-0 stderr as signal; parse stdout only.** Always set `FASTEDIT_NO_UPDATE_CHECK=1` in subprocess env to suppress the banner.

### Stdout parsing

Signal matchers (applied in order, first match wins):

| Pattern | Classification |
|---|---|
| `^Applied edit to ` | plain success |
| `^Applied \d+ edits to ` | plain success |
| `^Renamed '.+' -> '.+' in ` | plain success |
| `^Reverted .+ to previous state\.` | plain success |
| `^Moved .+ from L\d+-\d+ to after ` | plain success |
| `^Warning: merged output has parse errors` | success + `details.warning` |
| `^Warning: .*chunk\(s\) rejected\. Partial edit applied\.` | success + `details.warning`, `details.partial = true` |
| `^No backup recorded for ` | success + `details.status = "no-backup"` |
| `^No changes detected in ` | success + `details.status = "no-changes"` |
| `^No results found\.$` | success + `details.status = "empty-results"` |
| `^No references found\.$` | success + `details.status = "empty-results"` |
| anything else with exit 0 | success with raw stdout (parse fallback, `details.parseFallback = true`) |

Unified-diff tail (for `rename` / `undo`) is passed through verbatim after the signal line.

## Config

Loader precedence for user-or-project keys is later-overrides-earlier (same pattern as `flow-system`); user-level-only keys are read only from user config:

1. `~/.pi/pi-edit.json`
2. `$(cwd)/.pi/pi-edit.json`

Schema (TypeBox):

```ts
type PiEditConfig = {
  // user-level only (ignored in project config):
  binary?: string;                    // absolute path; must exist; default resolves "fastedit" from PATH
  trustedExternalPaths?: boolean;     // default false

  // user-or-project:
  backend?: "mlx" | "vllm";           // only values fastedit CLI accepts today
  useExternalLLM?: boolean;           // sets FASTEDIT_BACKEND=llm when true
  modelPath?: string;                 // FASTEDIT_MODEL_PATH
  vllm?: {
    apiBase?: string;                 // FASTEDIT_VLLM_API_BASE
    model?: string;                   // FASTEDIT_VLLM_MODEL
    apiKey?: string;                  // FASTEDIT_VLLM_API_KEY
    maxTokens?: number;               // FASTEDIT_VLLM_MAX_TOKENS
  };
  defaultTimeoutMs?: number;          // default 60_000
  noUpdateCheck?: boolean;            // sets FASTEDIT_NO_UPDATE_CHECK=1
};
```

**Config trust model:**
- Only user-level `~/.pi/pi-edit.json` can set `binary` or `trustedExternalPaths`. Project-level `$(cwd)/.pi/pi-edit.json` values for those keys are ignored with a warning.
- The `tldr` binary must be on PATH; we do not offer an override because fastedit invokes the literal name internally.
- `backend` only exposes `mlx|vllm` (the CLI-supported set). To route through an external OpenAI-compatible server, set `useExternalLLM: true`, which in turn sets `FASTEDIT_BACKEND=llm` in the subprocess env; doctor verifies the running `fastedit` version supports it.
- Only whitelisted `FASTEDIT_*` env vars are forwarded or set; non-whitelisted `FASTEDIT_*` entries are stripped from the child env, while non-`FASTEDIT_*` env passes through unchanged.
- Doctor result surfaces the resolved config source (`user` / `project` / `default`) per key.

## Doctor preflight

Tool: `pi_edit_doctor` (registered regardless of doctor status, always returns text; missing binaries are reported in its text/details, not thrown by the doctor tool itself).

Doctor runs once per `{canonicalCwd, configHash, binary}` key with a promise-based memo to prevent `session_start` + first-tool-call races:

```ts
type DoctorKey = string; // sha256(`${canonicalCwd}::${configHash}::${binary}`)
type DoctorSnapshot = {
  ok: boolean;
  fastedit: { present: boolean; version?: string; supportsExternalLLM?: boolean };
  tldr: { present: boolean };
  backend: { chosen?: string; modelReady?: boolean };
  configSources: Record<string, "user" | "project" | "default">;
  rawStdout: string;
  rawStderr: string;
  checkedAt: number;
};

type DoctorCacheEntry = { promise: Promise<DoctorSnapshot>; ttlMs: number };
const doctorCache = new Map<DoctorKey, DoctorCacheEntry>();
```

- `fastedit` version floor pinned in code; doctor refuses to run tools against older versions.
- Binary-missing and version-floor-violation are **hard failures** for all non-doctor tools (throw from `execute`).
- `tldr`-missing degrades only tools that need it (`pi_edit_read`, `pi_edit_search`) — those return a soft error; other tools run.
- Doctor cache is invalidated whenever the user or project `pi-edit.json` mtime changes (watched via `fs.watch` in best-effort mode; TTL fallback 10 min).

## Telemetry

Custom session entry `pi_edit_metrics` persisted via `pi.appendEntry` on both `agent_end` and `session_shutdown` (mirrors `flow-system` dual-hook persistence), with a dedup key so identical snapshots are skipped. Snapshot validated with TypeBox on restore; corrupt entries are discarded silently and a fresh metrics state starts.

```ts
type PiEditMetricsEntry = {
  byTool: Record<string, {
    calls: number;
    successes: number;
    failures: number;
    totalLatencyMs: number;
    deterministic: number;   // inferred from "0 model tokens" lines
    modelBacked: number;     // "tokens" non-zero
  }>;
  updatedAt: number;
};
```

Restored on `session_start` by `findLatestCustomEntry` (already in `shared/session.ts`). No PII stored.

## Idempotent registration

Copy the flow-system pattern verbatim:

```ts
type PiEditInitState = {
  toolsRegistered: Set<string>;
  sessionStartRegistered: boolean;
  agentEndRegistered: boolean;
  resourcesDiscoverRegistered: boolean;
  initialized: boolean;
};
const states = new WeakMap<ExtensionAPI, PiEditInitState>();
```

`resources_discover` returns `{ skillPaths: [<skillDir>] }` where `baseDir = dirname(fileURLToPath(import.meta.url))` and `skillDir = join(baseDir, "..", "skills", "pi-edit")` — one entry, not a path-segment list. Matches `flow-system/index.ts` pattern.

## Effect v4 alignment

**Effect v4 (`effect@4.0.0-beta.48`) inside `src/`, Promise boundary at `index.ts` `execute`.** Matches `extensions/flow-system` patterns: `Data.TaggedError`, `Effect.acquireUseRelease`, `runPromiseExit` at boundary, typed error union.

### Typed errors (`src/errors.ts`)

```ts
import { Data } from "effect";

export class InvalidParamsError extends Data.TaggedError("InvalidParamsError")<{
  readonly reason: string;
}> {}
export class ConfirmRequiredError extends Data.TaggedError("ConfirmRequiredError")<{
  readonly tool: string;
}> {}
export class FasteditTimeoutError extends Data.TaggedError("FasteditTimeoutError")<{
  readonly command: string; readonly timeoutMs: number;
}> {}
export class FasteditMissingError extends Data.TaggedError("FasteditMissingError")<{
  readonly binary: string;
}> {}
export class FasteditVersionError extends Data.TaggedError("FasteditVersionError")<{
  readonly found: string; readonly required: string;
}> {}
export class PathEscapeError extends Data.TaggedError("PathEscapeError")<{
  readonly path: string; readonly cwd: string;
}> {}
export class FasteditSoftError extends Data.TaggedError("FasteditSoftError")<{
  readonly reason:
    | "no-undo-history" | "no-occurrences" | "no-references"
    | "fastedit-error" | "requires-force";
  readonly stderr: string;
  readonly suggest?: string;
}> {}

export type PiEditError =
  | InvalidParamsError | ConfirmRequiredError
  | FasteditTimeoutError | FasteditMissingError | FasteditVersionError
  | PathEscapeError | FasteditSoftError;
```

### Boundary runner (`src/tool-runtime.ts`)

```ts
import { Effect, Exit, Cause } from "effect";

export const runTool = async <A>(
  effect: Effect.Effect<A, PiEditError>,
  serialize: (value: A) => AgentToolResult<PiEditDetails>,
): Promise<AgentToolResult<PiEditDetails>> => {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return serialize(exit.value);
  const failure = Cause.failureOption(exit.cause);
  if (failure._tag === "Some" && failure.value._tag === "FasteditSoftError") {
    return {
      content: [{ type: "text" as const, text: renderSoft(failure.value) }],
      isError: true,
      details: { reason: failure.value.reason, suggest: failure.value.suggest },
    };
  }
  throw toAgentError(failure, exit.cause);
};
```

### Per-path mutex via `Effect.acquireUseRelease`

Multi-file tools sort canonical paths and nest `withLock` to prevent deadlocks. `pi_edit_rename_all` write mode uses a single root-level mutex keyed by canonical root path.

### Doctor memoization

`Effect.cached` against a `Map<DoctorKey, CachedEffect>` keyed by `sha256(canonicalCwd::configHash::binary)`. TTL 10 min + mtime invalidation on `~/.pi/pi-edit.json` and `$(cwd)/.pi/pi-edit.json` via best-effort `fs.watch`.

### Subprocess wrapper edge

`shared/subprocess.ts::spawnCollect` stays Promise-based (Bun-native). Wrap only at the edge:

```ts
const runFastedit = (argv: string[], input?: string, signal?: AbortSignal) =>
  Effect.tryPromise({
    try: () => spawnCollect(argv, { stdin: input, signal, timeoutMs: 60_000, env: whitelistedEnv() }),
    catch: () => new FasteditTimeoutError({ command: argv.join(" "), timeoutMs: 60_000 }),
  }).pipe(Effect.flatMap(classifyResult));
```

### Boundary rules (AGENTS)

- `Effect.runPromiseExit` called only from `runTool` in `index.ts`/`src/tool-runtime.ts`.
- Every other module stays Effect-native.
- No `as any`, no `@ts-ignore`.
- No `Layer`/`Context` DI in MVP — kept for post-MVP triggers.

### Post-MVP Effect surface (not v1)

- `Layer`-based doctor + mutex services if multi-workspace parallelism lands.
- `Schedule.exponential` retry for vLLM cold-start on `FasteditTimeoutError`.
- `STM` coordination if a persistent `fastedit-mcp` sidecar pool lands.

## Benchmark (acceptance gate)

10-case micro-benchmark (see `pi-edit-positioning.md`). v1 gate runs the implemented cases (1-7 plus `pi_edit_undo` smoke coverage); cases 8-10 remain recorded as deferred v1.1 baselines until move/delete tools land. Target for implemented cases:
- median `tokens_out` reduction ≥ 40% on 7 implemented edit cases,
- median `wall_ms` ≤ native `Edit` on 7 implemented edit cases,
- structural correctness = 100% on cases 1/2/5/7 (zero-model paths).

Benchmark harness lives under `extensions/pi-edit/test/benchmark/` and uses the stub binary for CI + real `fastedit` for local runs.

## Risks

| Risk | Mitigation |
|---|---|
| Heavy Python + ML stack on user machine | Doctor preflight; friendly error if absent; no auto-install |
| MLX macOS-only; Linux users confused | Docs expose Linux/GPU as `backend: "vllm"`; external endpoint path uses `useExternalLLM: true` and doctor probes support before non-doctor tools run |
| `tldr` binary collides with popular `tldr-pages` same-name binary | Detect by `--version` signature at doctor and fail/degrade read/search clearly; no override because fastedit invokes literal `tldr` internally |
| MCP server auto-config collision with Claude Code | We never run `fastedit mcp-install`; pure CLI path |
| `fastedit` breaking changes | Pin doctor version floor; surface `version` in `pi_edit_doctor` |
| `rename-all` walking unintended dirs | Expose `only` filter; require explicit `root` path (no implicit `.`) |
| `fastedit delete` silent data loss on force | `pi_edit_delete` deferred; when landed, require `confirm=true` separate from `force=true` |

## Non-goals

- No embedding of fastedit source.
- No reimplementing fastedit's AST / merge model in TS.
- No auto-install of `fastedit-hook` into Claude Code.
- No cross-process sidecar in v1.
- No MCP-client runtime.

## References

- fastedit README: <https://github.com/parcadei/fastedit>
- fastedit model card: <https://huggingface.co/continuous-lab/FastEdit>
- Roadmap touchpoints: `roadmap-touchpoints.md`
- Surface notes: `pi-extension-surface-notes.md`
- Positioning matrix: `pi-edit-positioning.md`
- Ecosystem compare: `pi-edit-ecosystem-compare.md`
- Reviewer findings: `pi-edit-rollback-review.md`
- Rollback contract (deferred): `pi-rollback-contract.md`
