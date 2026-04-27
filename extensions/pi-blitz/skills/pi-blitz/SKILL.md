---
name: pi-blitz
description: Pre-alpha skill for symbol-anchored edits through the blitz Zig CLI. Do not use for live writes until the standalone CLI passes the pre-extension review gate.
---

# pi-blitz

## Current status

Pre-alpha / review-blocked. As of 2026-04-27, do **not** use `pi_blitz_edit` or `pi_blitz_batch` for live writes until the standalone CLI passes the `docs/architecture/blitz.md` §10.3 review gate. Known blockers include `edit --after`, declaration targeting, marker splice correctness, batch marker parity, and golden-output benchmarks.

## When to use

Use only after the review gate passes:

- Target edit is AST-scoped: a function, method, class, variable.
- You can describe the edit as "replace the body of `X`" or "insert this right after `X`".
- You want a smaller output token footprint, and the relevant benchmark case has golden-output coverage.

## When NOT to use

- Full-file rewrites — use core `write` / `edit`.
- Text-`oldText/newText` edits that aren't symbol-scoped — use `pi-mono-multi-edit`.
- Quick one-line changes where reading + edit is faster than symbol resolution.
- Files whose language is not yet supported by blitz (check `pi_blitz_doctor`).

## Tools

| Tool | Purpose |
|---|---|
| `pi_blitz_read` | AST structure summary of a file (imports + L-range definitions). |
| `pi_blitz_edit` | Single symbol-anchored edit. Exactly one of `after`/`replace`. |
| `pi_blitz_batch` | Multiple symbol-anchored edits in one file. |
| `pi_blitz_rename` | AST-verified rename in one file (skips strings/comments). |
| `pi_blitz_undo` | Revert the last blitz edit on a file. Requires `confirm: true`. |
| `pi_blitz_doctor` | Report version, grammars, cache health. |

## Snippet grammar

Three ways to preserve unchanged body when you don't want to rewrite the whole symbol:

1. **`// ... existing code ...`** (and language-matching `#`/`/* */` variants) — fastedit-compatible lazy marker.
2. **`// @keep`** — strict marker, recommended for unambiguous edits.
3. **`// @keep lines=N`** — numeric anchor, least ambiguous.

If you do not use a marker, the snippet is treated as a **full replacement** of the target symbol body. Marker behavior is not considered safe until the review gate passes.

## Examples

### Wrap a function in try/catch

```ts
pi_blitz_edit({
  file: "src/app.ts",
  replace: "handleRequest",
  snippet: `function handleRequest(req) {
  try {
    // @keep
  } catch (e) {
    logger.error(e);
    throw e;
  }
}`,
});
```

### Insert a helper after a symbol

```ts
pi_blitz_edit({
  file: "src/app.ts",
  after: "handleRequest",
  snippet: `function healthCheck() {
  return { ok: true };
}`,
});
```

### Rename across a file

```ts
pi_blitz_rename({
  file: "src/app.ts",
  old_name: "oldName",
  new_name: "newName",
});
```

## Error handling

- `isError: true` with `details.reason = "no-undo-history"` — no previous edit to revert.
- `isError: true` with `details.reason = "no-occurrences"` — rename/edit target not found.
- `details.warning = "partial-edit"` — write succeeded but some chunks rejected; run `pi_blitz_diff` (v0.2) to review.
- Hard throws (shown in Pi as tool errors): binary missing, timeout, path escapes cwd, invalid params.

## Fallback to core `edit`

When blitz emits `{ "status": "needs_host_merge", ... }` as a single-line JSON payload, the target change can't be applied deterministically. Use the payload fields (`byteStart`, `byteEnd`, `excerpt`) to call core `edit` with a minimal context window — do not repeat the whole file.
