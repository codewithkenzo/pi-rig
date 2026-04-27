# pi_blitz_apply implementation summary

## Scope

Implemented v0.2 `pi_blitz_apply` in `extensions/pi-blitz`, kept changes confined to:

- `extensions/pi-blitz/src/tools.ts`
- `extensions/pi-blitz/src/tool-runtime.ts`
- `extensions/pi-blitz/index.ts`
- `extensions/pi-blitz/README.md`
- `extensions/pi-blitz/skills/pi-blitz/SKILL.md`
- `extensions/pi-blitz/test/smoke.test.ts`
- `extensions/pi-blitz/test/apply-runtime.test.ts`
- `progress.md`

## Summary of changes

- Added structured v0.2 request schema for `pi_blitz_apply`:
  - `operation` enum, `target` object, broad `edit` payload with runtime checks.
  - Supported operations: `replace_body_span`, `insert_body_span`, `wrap_body`, `compose_body`, `insert_after_symbol`, `set_body`.
  - Added optional `dry_run`, `include_diff`, and `options` controls.
- Added request builder for JSON payload with:
  - `version: 1`, `file`, `operation`, `target`, `edit`.
  - `options` defaults (`requireParseClean`, `requireSingleMatch`) and optional diff/mode flags.
- Added CLI runner path using `blitz apply --edit - --json`.
  - Includes `--dry-run`/`--diff` when requested.
  - Uses per-path mutex lock for file-scoped operations.
- Added JSON response parser and compact formatter for `pi_blitz_apply`:
  - extracts `status`, `operation`, `file`, `ranges`, `diffSummary`, `validation`, `metrics`.
  - surfaces compact status summary text in tool result.
  - only includes savings claim when status is `applied|preview` and parser indicates parse correctness is not explicitly false.
- Added new tool registration in `extensions/pi-blitz/index.ts`.
- Extended `PiBlitzDetails` to include apply-oriented fields (`file`, `ranges`, `diffSummary`, `validation`, `metrics`, `operation`).
- Updated SKILL.md with operation-selection rules and operation examples.
- Added smoke tests in `smoke.test.ts` for schema/runtime parsing.
- Added mocked-runner test `apply-runtime.test.ts` using mocked `spawnCollectNode` to validate tool-call JSON payload and command args.

## Verification run

### Commands

- `bun run typecheck` (extension)
  - Passed.
- `bun test` (extension)
  - Passed.
- `bun run build` (extension)
  - Passed.

- `bun run typecheck` (repo root)
  - Passed.
- `bun run build` (repo root)
  - Passed.
- `bun test` (repo root)
  - Fails in unrelated suites (pre-existing in this worktree): `notify-cron` auth tests and `packages/pi-installer` bundle tests.

## CLI dependency / install note

Runtime for `pi_blitz_apply` still depends on `blitz` CLI availability in PATH.
No local verified `blitz` binary was installed/executed in this run.
Only mocked runner was used for tool execution test.
