# flow-system

Pi agent extension that adds flow profiles, a job queue, and skill injection to pi subagent runs.

## What it does

Registers two tools and one command:

| Surface | Name | Purpose |
|---------|------|---------|
| Tool | `flow_run` | Run a single task with a named profile (foreground or background) |
| Tool | `flow_batch` | Run multiple tasks sequentially or in parallel |
| Command | `/flow` | Manage jobs: `status`, `cancel <id>`, `profiles` |

## Profiles

Built-in profiles control reasoning level, iteration cap, and toolsets:

| Profile | Reasoning | Iterations | Toolsets |
|---------|-----------|------------|----------|
| explore | low | 11 | terminal, file |
| research | medium | 18 | terminal, file, web |
| coder | medium | 35 | code_execution |
| debug | high | 20 | (inherits) |
| browser | medium | 25 | browser |
| ambivalent | medium | 18 | (inherits) |

Custom profiles can be added via JSON files:

- `~/.pi/agent/flow-profiles.json` (global)
- `<cwd>/.pi/flow-profiles.json` (project-local, wins ties)

## Architecture

```
index.ts              Extension entry — wires queue, tools, commands, session events
src/
  types.ts            TypeBox schemas + tagged errors
  queue.ts            In-memory job queue (Effect Ref)
  profiles.ts         Built-in profiles + file-based overrides
  executor.ts         Subprocess runner (Effect.async + acquireUseRelease)
  vfs.ts              Skill file staging with temp file lifecycle
  tool.ts             flow_run tool implementation
  batch-tool.ts       flow_batch tool implementation
  commands.ts         /flow command (status, cancel, profiles)
```

## Key patterns

- **Effect at boundaries**: all internal logic uses Effect-TS. Conversion to Promise happens only at the pi API surface (`Effect.runPromise` / `Effect.runPromiseExit`).
- **Tagged errors**: `ProfileNotFoundError`, `SkillLoadError`, `SubprocessError`, `JobNotFoundError` — no trailing `()` per Bun 1.3+ convention.
- **acquireUseRelease**: skill temp files are always cleaned up, even on subprocess failure or interruption.
- **Session persistence**: queue state is snapshotted to a custom entry on `agent_end` and restored on `session_start`.

## Install

```bash
cd extensions/flow-system
bun install
```

Register in pi:

```
/extension install /path/to/extensions/flow-system
```

## Development

```bash
bun tsc --noEmit   # typecheck
bun test            # tests
```
