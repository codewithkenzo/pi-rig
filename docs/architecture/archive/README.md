# Archive

Superseded, deferred, or absorbed architecture drafts. Kept for history/context only. **Do not use as current source of truth.**

Active specs live in the parent `docs/architecture/` directory:
- `blitz.md` — blitz CLI + `@codewithkenzo/pi-blitz` extension (single source of truth for this plugin)
- `next-spec-synthesis.md` — master plugin roadmap
- `pi-extension-surface-notes.md` — shared pi-mono ExtensionAPI reference
- `fs-sandbox-coordination.md` — unrelated other-plugin design

## Superseded (folded into `blitz.md`)

| File | Why archived |
|---|---|
| `blitz-design-superseded.md` | First blitz spec draft. Replaced by consolidated `blitz.md` after Zig 0.16 verification corrected build.zig / allocator / atomicFile / @cImport claims. |
| `blitz-gap-closure.md` | Absorbed into `blitz.md` §7 (Layer B/C/D). |
| `blitz-perf-patterns.md` | Absorbed into `blitz.md` §7.2. Reviewer corrections applied. |
| `pi-edit-positioning.md` | Absorbed into `blitz.md` §2 (Ecosystem slot). |
| `pi-edit-ecosystem-compare.md` | Absorbed into `blitz.md` §2. |
| `pi-edit-local-overlap.md` | Absorbed into `blitz.md` §2. |
| `zig-0.16-verification.md` | Corrections applied to `blitz.md` §4; doc no longer needed as a standalone. |
| `fastedit-integration-superseded.md` | Original fastedit-wrapper design. Rejected because fastedit requires Python + 1.7B model + MLX/vLLM. Replaced by blitz (no model, no Python, static Zig binary). Error taxonomy + Effect v4 + path policy concepts carried forward. |
| `pi-edit-rollback-review.md` | First-pass reviewer findings against the fastedit spec. All applicable items folded into `blitz.md`. |

## Deferred (do not implement)

| File | Why |
|---|---|
| `pi-rollback-contract.md` | Pi core rollback + `pi-rewind` / `pi-rewind-hook` already cover the space. Revisit only if blitz-undo coordination needs its own plugin surface. |

## One-offs (no ongoing value)

| File | Why |
|---|---|
| `roadmap-touchpoints.md` | Scan of docs mentioning `pi-diff` / `pi-rollback` during the April 2026 pivot. Inventory-only. |
