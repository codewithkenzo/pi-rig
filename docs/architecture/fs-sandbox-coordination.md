# fs-sandbox coordination design (pre-implementation)

## Goal

Allow `fs-sandbox` to enforce read/write policy for flow dispatch subprocess work without tightly coupling extension internals.

## Proposed contract

`flow-system` accepts an optional executor adapter at initialization:

- `run(options)` wraps subprocess execution
- `prepare?(job)` runs before subprocess spawn (policy checks, temp mounts)
- `cleanup?(job, outcome)` runs after completion/cancel/failure

If no adapter is provided, `flow-system` uses the current internal executor behavior.

## Suggested shape

```ts
export interface FlowExecutionAdapter {
  prepare?: (input: { jobId: string; cwd?: string; profile: string }) => Promise<void>;
  run: (input: ExecuteOptions) => Promise<string>;
  cleanup?: (input: { jobId: string; status: "done" | "failed" | "cancelled" }) => Promise<void>;
}
```

## Integration points

1. `extensions/flow-system/index.ts`
   - inject adapter into `makeFlowTool` / `makeFlowBatchTool`
2. `extensions/flow-system/src/tool.ts`
   - call `prepare` before job start, `cleanup` in `finally`
3. `extensions/flow-system/src/batch-tool.ts`
   - same lifecycle per item

## fs-sandbox responsibilities

- validate cwd and target paths against sandbox policy
- expose denial reason strings suitable for `SubprocessError`
- ensure policy teardown on cancellation

## Rollout plan

1. Add optional adapter interface and default no-op wiring
2. Add adapter lifecycle tests with fake adapter
3. Add `fs-sandbox` implementation in a follow-up ticket

## Non-goals

- no cross-extension global registry
- no direct imports from `fs-sandbox` into `flow-system`
- no Layer/Context runtime wiring
