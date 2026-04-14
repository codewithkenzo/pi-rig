import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { makeQueue } from "../src/queue.js";
import { makeFlowBatchTool } from "../src/batch-tool.js";
import { FlowCancelledError } from "../src/types.js";
import type { ExecuteOptions } from "../src/executor.js";

describe("flow_batch cancellation", () => {
	it("cancels running and pending jobs from the tool AbortSignal", async () => {
		const queue = await Effect.runPromise(makeQueue());
		let startedCount = 0;
		let resolveStarted: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			resolveStarted = resolve;
		});

		const fakeExecute = ({ signal }: ExecuteOptions) =>
			Effect.callback<string, FlowCancelledError>(
				(resume: (effect: Effect.Effect<string, FlowCancelledError>) => void) => {
					startedCount += 1;
					if (startedCount === 1) {
						resolveStarted?.();
					}
					if (signal?.aborted) {
						resume(Effect.fail(new FlowCancelledError({ reason: "Flow cancelled." })));
						return Effect.void;
					}
					const onAbort = () => {
						resume(Effect.fail(new FlowCancelledError({ reason: "Flow cancelled." })));
					};
					signal?.addEventListener("abort", onAbort, { once: true });
					return Effect.sync(() => {
						signal?.removeEventListener("abort", onAbort);
					});
				},
			);

		const tool = makeFlowBatchTool(queue, fakeExecute);
		const controller = new AbortController();
		const execution = tool.execute(
			"batch-1",
			{
				items: [
					{ profile: "explore", task: "job 1" },
					{ profile: "explore", task: "job 2" },
				],
				parallel: false,
			},
			controller.signal,
			undefined,
			{},
		);

		await started;
		controller.abort();

		const result = await execution;
		const jobs = await Effect.runPromise(queue.getAll());

		expect(result.details).toMatchObject({ status: "cancelled", cancelCount: 2, successCount: 0, failCount: 0 });
		expect(jobs).toHaveLength(2);
		expect(jobs.map((job) => job.status)).toEqual(["cancelled", "cancelled"]);
	});

	it("handles an AbortSignal that fires during setup before jobs start running", async () => {
		const queue = await Effect.runPromise(makeQueue());
		let startedCount = 0;

		const fakeExecute = (_options: ExecuteOptions) => {
			startedCount += 1;
			return Effect.succeed("should not run");
		};

		const tool = makeFlowBatchTool(queue, fakeExecute);
		const controller = new AbortController();
		const execution = tool.execute(
			"batch-setup-cancel",
			{
				items: [
					{ profile: "explore", task: "job 1" },
					{ profile: "explore", task: "job 2" },
				],
				parallel: false,
			},
			controller.signal,
			undefined,
			{},
		);

		controller.abort();
		const result = await execution;
		const jobs = await Effect.runPromise(queue.getAll());

		expect(startedCount).toBe(0);
		expect(result.details).toMatchObject({ status: "cancelled", cancelCount: 2, successCount: 0, failCount: 0 });
		expect(jobs.map((job) => job.status)).toEqual(["cancelled", "cancelled"]);
	});
});
