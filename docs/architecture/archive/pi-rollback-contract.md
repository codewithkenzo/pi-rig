# pi-rollback — recovery adapter contract (DEFERRED)

> **Status: Deferred (2026-04-24).** Pi core rollback plus the `pi-rewind` / `pi-rewind-hook` ecosystem plugins already cover this space. Do not start implementation. Kept as a record of the design space; revisit only if a fastedit-undo-specific integration needs its own plugin surface.
>
> Focus of the current wave is **`pi-edit` output-token reduction**, not rollback.

Draft contract for the (deferred) `extensions/pi-rollback/` package. Pre-implementation; no code.

## Goal

Provide a small, safe, adapter-based revert surface for pi so agents can undo recent mutations without hand-rolling `git stash` / `git checkout` / manual edits, and so the mechanism composes with `pi-edit` and other write lanes.

## Scope

In scope:
- Single-file revert of the last edit (or last N).
- Session-scoped multi-file revert ("undo everything pi changed this session").
- Dry-run preview for every destructive op.

Out of scope (v1):
- Cross-branch time travel.
- Full VCS replacement.
- Rewriting history.

## Adapter contract

```ts
export interface RollbackTarget {
  kind: "file" | "directory" | "session";
  path?: string;            // required for file/directory
  sessionId?: string;       // required for session
}

export interface RollbackAdapter {
  id: string;                                   // "fastedit-undo" | "git-stash" | "vfs-snapshot" | ...
  canHandle(target: RollbackTarget): Promise<boolean>;
  listVersions(target: RollbackTarget): Promise<RollbackVersion[]>;
  dryRun(target: RollbackTarget, version?: string): Promise<RollbackPreview>;
  revert(target: RollbackTarget, version?: string): Promise<RollbackResult>;
}

export interface RollbackVersion {
  id: string;               // adapter-specific (sha, stash ref, backup id)
  label: string;            // human-readable
  createdAt: number;
  source: string;           // adapter id
}

export interface RollbackPreview {
  diff: string;             // unified diff, adapter supplies
  filesAffected: string[];
  reversible: boolean;      // true when adapter can re-redo the change
}

export interface RollbackResult {
  ok: boolean;
  revertedFiles: string[];
  message: string;
  versionRef?: string;      // pointer for potential redo
}
```

Adapters are plain TS objects; no DI container, no Effect `Layer`. Matches existing repo style.

## Registry

```ts
export interface RollbackRegistry {
  register(adapter: RollbackAdapter): void;
  find(target: RollbackTarget): Promise<RollbackAdapter[]>;   // ordered by priority
}
```

Priority order (highest first):
1. `fastedit-undo` — when file is within a fastedit-tracked path and has a backup.
2. `git-stash` — when repo has a clean stash entry that matches.
3. `vfs-snapshot` (future) — when fs-sandbox recorded a pre-image.

Selection surfaces to the user via `pi_rollback_history`; `pi_rollback_file` picks the highest-priority adapter by default, user can override via `adapter: "git-stash"` param.

## Tool surface (MVP = 4 tools)

| Pi tool | Purpose |
|---|---|
| `pi_rollback_history` | List recent rollback-capable versions across adapters for a target. `{ target: RollbackTarget; limit?: number }` |
| `pi_rollback_dryrun` | Preview diff + files affected. `{ target: RollbackTarget; versionId?: string; adapter?: string }` |
| `pi_rollback_file` | Execute revert. Requires `confirm: true`. `{ target: { kind: "file"; path: string }; versionId?: string; adapter?: string; confirm: true }` |
| `pi_rollback_session` | Revert every file pi modified this session. Requires `confirm: true` and defaults to dry-run unless `apply: true`. |

All destructive tools hard-fail (throw) when `confirm: true` is missing — pi surfaces this to the LLM as a real error, not a soft result, so the agent is forced to re-ask with explicit intent.

## Adapter: `fastedit-undo`

Thin wrapper around `fastedit undo <file>`. Reuses `shared/subprocess.ts`.

- `canHandle`: `target.kind === "file"` and `fastedit diff <file>` returns non-empty (has backup).
- `listVersions`: returns a single synthetic version `{ id: "last", label: "last fastedit edit", ... }` because fastedit's undo log is single-depth per file.
- `dryRun`: runs `fastedit diff <file>`, returns the diff verbatim.
- `revert`: runs `fastedit undo <file>`; parses `Reverted <file> to previous state.`; returns `{ ok: true, revertedFiles: [path], ... }`.
- Not reversible (`preview.reversible = false`) — fastedit does not keep redo history.

## Adapter: `git-stash`

- `canHandle`: target inside a git worktree; `git stash list` not empty or `git status` shows staged/unstaged hunks.
- `listVersions`: `git stash list --format='%gd %s'` → map each ref to a `RollbackVersion`.
- `dryRun`: `git stash show -p <ref>` for stash versions; `git diff -- <path>` for working-tree reverts.
- `revert`:
  - Working-tree revert (no stash): `git checkout -- <path>` (or `git restore <path>` when available).
  - Stash revert: `git stash apply <ref>` with conflict detection; on conflict, abort and return `{ ok: false, message: "conflict" }` without mutating tree.
- `reversible = true` — the reverse op is `git stash push` or re-editing.

Safety: always refuse when `git status` shows an in-flight merge/rebase/cherry-pick (detect via `.git/MERGE_HEAD`, `.git/REBASE_HEAD`, etc.).

## Adapter: `vfs-snapshot` (future, stub)

Placeholder interface only; implementation blocked on `fs-sandbox` landing. Contract reserved so the registry priority stays stable.

## Config

`~/.pi/pi-rollback.json` + `$(cwd)/.pi/pi-rollback.json`:

```ts
type PiRollbackConfig = {
  enabledAdapters?: Array<"fastedit-undo" | "git-stash" | "vfs-snapshot">;
  priority?: Array<"fastedit-undo" | "git-stash" | "vfs-snapshot">;
  requireConfirm?: boolean;    // default true; user can relax for scripted sessions
  sessionLogRetention?: number; // default 50 entries
};
```

## Session log persistence

Custom entry `pi_rollback_log`, appended on every successful or attempted rollback:

```ts
type PiRollbackLogEntry = {
  op: "history" | "dryrun" | "revert";
  adapter: string;
  target: RollbackTarget;
  versionId?: string;
  ok: boolean;
  message: string;
  revertedFiles?: string[];
  ts: number;
};
```

Bounded to `sessionLogRetention` entries. Restored on `session_start` via `findLatestCustomEntry`.

## Effect-TS decision

**Not in MVP.** Adapter dispatch is a list walk; every call is a single subprocess.

Promotion triggers (revisit later):
- atomic multi-file revert with partial-failure rollback,
- coordinated lock with `fs-sandbox`,
- durable transactional undo log with retries.

Until then, plain async/await + `shared/subprocess.ts` matches the repo style.

## Risks

| Risk | Mitigation |
|---|---|
| Accidental data loss on session-wide revert | `pi_rollback_session` requires `confirm: true` **and** `apply: true`; defaults to dry-run |
| Stash conflicts leaving tree dirty | Adapter refuses conflict, reports without mutating |
| `fastedit-undo` depth = 1 surprises users | Doc + history tool shows "last only" label explicitly |
| Mis-detection of git state (rebase/merge) | Check for `.git/*_HEAD` files before any git-stash op |
| Adapter priority surprising the user | `pi_rollback_history` lists which adapter would fire for each version |

## Non-goals

- No implicit autosave of pre-edit snapshots beyond what adapters already provide.
- No UI for interactive selection in v1 — stay tool-call-only.
- No integration with VCS hosting APIs.

## References

- Integration doc: `pi-edit-fastedit-integration.md`
- Shared subprocess runner: `shared/subprocess.ts`
- Session entry helper: `shared/session.ts::findLatestCustomEntry`
- Idempotent extension registration pattern: `extensions/flow-system/index.ts`
