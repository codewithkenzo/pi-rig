# @codewithkenzo/pi-blitz

Pi extension that wraps the [`blitz`](https://github.com/codewithkenzo/blitz) AST-aware fast-edit CLI.

> **Status: pre-alpha scaffold, local CLI review-passed.** Seven tool slots are registered. Standalone `blitz` passed local `gpt-5.5` xhigh review for controlled testing, but this extension is not ready for public install/prebuilt release yet.

## What you get

- 7 tools: `pi_blitz_read`, `pi_blitz_edit`, `pi_blitz_batch`, `pi_blitz_apply`, `pi_blitz_rename`, `pi_blitz_undo`, `pi_blitz_doctor`.
- Effect v4 internals (typed error union, per-path mutex via `acquireUseRelease`, `Cause.findErrorOption` boundary).
- Token-savings path has local microbench evidence only: direct lane ~41%, marker fixture ~83% by bytes/4 estimate; public claims wait for the 10-case benchmark.
- Single prebuilt binary per platform (no Python, no local model).

## Install

Requires a review-approved `blitz` binary on `PATH`. For controlled local testing, either:

- `npm install -g @codewithkenzo/blitz` (once published; pulls the prebuilt binary for your platform).
- or point `~/.pi/pi-blitz.json` at your built binary:
  ```json
  { "binary": "/abs/path/to/blitz" }
  ```

Then install the Pi extension:

```bash
pi install npm:@codewithkenzo/pi-blitz
# or from source:
pi install /abs/path/to/pi-plugins-repo-kenzo/extensions/pi-blitz
```

Verify: `/help` should list the seven `pi_blitz_*` tools. Use locally with review/undo discipline until telemetry is collected.

## Config

`~/.pi/pi-blitz.json` (user-level) + `.pi/pi-blitz.json` (project-level). User-only keys are `binary` and `trustedExternalPaths` — project config cannot override them.

```ts
type PiBlitzConfig = {
  binary?: string;                 // user-only; absolute path to blitz
  trustedExternalPaths?: boolean;  // user-only; allow paths outside cwd
  defaultTimeoutMs?: number;       // default 60_000 for edit, 30_000 otherwise
  cacheDir?: string;               // overrides ~/.cache/blitz
  noUpdateCheck?: boolean;
};
```

## Design

See `codewithkenzo/pi-rig/docs/architecture/blitz.md` for the full spec, active blockers, and the pre-extension review gate.

## License

MIT.
