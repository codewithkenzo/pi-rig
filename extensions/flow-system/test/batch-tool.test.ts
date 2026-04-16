import { describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Value } from "@sinclair/typebox/value";
import { Effect } from "effect";
import { makeQueue } from "../src/queue.js";
import { makeFlowBatchTool } from "../src/batch-tool.js";
import { FlowCancelledError, SubprocessError } from "../src/types.js";
import type { ExecuteOptions } from "../src/executor.js";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const makeDeferred = (): { promise: Promise<void>; resolve: () => void } => {
	let resolve!: () => void;
	const promise = new Promise<void>((promiseResolve) => {
		resolve = promiseResolve;
	});
	return { promise, resolve };
};

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

	it("fails before enqueue when an item resolves without model", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-batch-envelope-"));
		try {
			await fs.mkdir(path.join(tempDir, ".pi"), { recursive: true });
			await fs.writeFile(
				path.join(tempDir, ".pi", "flow-profiles.json"),
				JSON.stringify([
					{
						name: "local-no-model",
						reasoning_level: "medium",
						toolsets: [],
						skills: [],
					},
				]),
				"utf8",
			);
			let invoked = false;
			const queue = await Effect.runPromise(makeQueue());
			const tool = makeFlowBatchTool(queue, () => {
				invoked = true;
				return Effect.succeed("should-not-run");
			});
			const result = await tool.execute(
				"batch-missing-model",
				{
					items: [{ profile: "local-no-model", task: "inspect model", cwd: tempDir }],
					parallel: false,
				},
				undefined,
				undefined,
				{},
			);
			const jobs = await Effect.runPromise(queue.getAll());
			expect(result.isError).toBe(true);
			expect(result.content[0]?.text).toContain("requires each item to resolve a concrete model");
			expect(invoked).toBe(false);
			expect(jobs).toHaveLength(0);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("persists recentTools on batch items", async () => {
		const queue = await Effect.runPromise(makeQueue());

		const fakeExecute = ({ onProgress }: ExecuteOptions) =>
			Effect.sync(() => {
				onProgress?.({ _tag: "tool_start", toolName: "grep", detail: "start grep" });
				onProgress?.({ _tag: "tool_end", toolName: "grep", detail: "done grep" });
				return "batch ok";
			});

		const tool = makeFlowBatchTool(queue, fakeExecute);
		const result = await tool.execute(
			"batch-recent-tools",
			{
				items: [{ profile: "explore", task: "job with tools" }],
				parallel: false,
			},
			undefined,
			undefined,
			{},
		);

		expect(result.details).toMatchObject({ status: "done", successCount: 1 });
		const jobs = await Effect.runPromise(queue.getAll());
		expect(jobs[0]?.status).toBe("done");
		expect(jobs[0]?.recentTools).toEqual(["grep…", "grep done"]);
	});

	it("keeps schema/runtime compatibility for legacy and explicit batch call shapes", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const tool = makeFlowBatchTool(queue, () => Effect.succeed("ok"));

		expect(
			Value.Check(tool.parameters, {
				items: [{ profile: "explore", task: "legacy shape" }],
			}),
		).toBe(true);
		expect(
			Value.Check(tool.parameters, {
				items: [{ profile: "explore", task: "explicit shape", cwd: "." }],
				parallel: false,
			}),
		).toBe(true);

		const result = await tool.execute(
			"batch-schema-fallback",
			{ items: [{ profile: "explore", task: "runtime fallback" }] },
			undefined,
			undefined,
			{},
		);
		expect(result.details).toMatchObject({ status: "done", successCount: 1 });
	});

	it("parallel mode runs all-success batches", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const tool = makeFlowBatchTool(
			queue,
			({ task }: ExecuteOptions) => Effect.succeed(`done:${task}`),
		);

		const result = await tool.execute(
			"batch-parallel-success",
			{
				items: [
					{ profile: "explore", task: "a" },
					{ profile: "explore", task: "b" },
					{ profile: "explore", task: "c" },
				],
				parallel: true,
			},
			undefined,
			undefined,
			{},
		);

		expect(result.details).toMatchObject({ status: "done", successCount: 3, failCount: 0, cancelCount: 0 });
	});

	it("parallel mode reports mixed success and failure", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const tool = makeFlowBatchTool(queue, ({ task }: ExecuteOptions) =>
			task.includes("fail")
				? Effect.fail(new SubprocessError({ exitCode: 1, stderr: "boom" }))
				: Effect.succeed(`done:${task}`),
		);

		const result = await tool.execute(
			"batch-parallel-mixed",
			{
				items: [
					{ profile: "explore", task: "ok-1" },
					{ profile: "explore", task: "fail-2" },
					{ profile: "explore", task: "ok-3" },
				],
				parallel: true,
			},
			undefined,
			undefined,
			{},
		);

		expect(result.details).toMatchObject({ status: "failed", successCount: 2, failCount: 1, cancelCount: 0 });
	});

	it("parallel mode respects queue maxConcurrent cap when parallel is enabled", async () => {
		const queue = await Effect.runPromise(makeQueue({ maxConcurrent: 1 }));
		let active = 0;
		let maxActive = 0;
		const tool = makeFlowBatchTool(queue, () =>
			Effect.promise(async () => {
				active += 1;
				maxActive = Math.max(maxActive, active);
				await sleep(25);
				active -= 1;
				return "ok";
			}),
		);

		await tool.execute(
			"batch-parallel-concurrency",
			{
				items: Array.from({ length: 10 }, (_, index) => ({
					profile: "explore",
					task: `task-${index}`,
				})),
				parallel: true,
			},
			undefined,
			undefined,
			{},
		);

		expect(maxActive).toBe(1);
	});

	it("sequential mode does not stall when maxConcurrent auto-promotes pending jobs", async () => {
		const queue = await Effect.runPromise(makeQueue({ maxConcurrent: 1 }));
		const executed: string[] = [];
		const tool = makeFlowBatchTool(queue, ({ task }: ExecuteOptions) =>
			Effect.promise(async () => {
				executed.push(task);
				await sleep(20);
				return `done:${task}`;
			}),
		);

		const execution = tool.execute(
			"batch-sequential-promote",
			{
				items: [
					{ profile: "explore", task: "first" },
					{ profile: "explore", task: "second" },
				],
				parallel: false,
			},
			undefined,
			undefined,
			{},
		);
		const timeout = sleep(600).then(() => "timeout" as const);
		const settled = await Promise.race([execution, timeout]);

		expect(settled).not.toBe("timeout");
		if (settled === "timeout") {
			throw new Error("sequential batch execution timed out");
		}

		expect(settled.details).toMatchObject({ status: "done", successCount: 2, failCount: 0, cancelCount: 0 });
		expect(executed).toEqual(["first", "second"]);
	});

	it("does not run pending batch item when batch is cancelled before it starts", async () => {
		const queue = await Effect.runPromise(makeQueue({ maxConcurrent: 1 }));
		const firstStarted = makeDeferred();
		const executedTasks: string[] = [];
		const firstShouldFinish = makeDeferred();
		const fakeExecute = ({ task, signal }: ExecuteOptions) =>
			Effect.callback<string, FlowCancelledError>(
				(resume: (effect: Effect.Effect<string, FlowCancelledError>) => void) => {
					executedTasks.push(task);
					if (task === "first") {
						firstStarted.resolve();
					}
					if (signal?.aborted) {
						resume(Effect.fail(new FlowCancelledError({ reason: "Flow cancelled." })));
						return Effect.void;
					}
					const onAbort = () => {
						resume(Effect.fail(new FlowCancelledError({ reason: "Flow cancelled." })));
					};
					signal?.addEventListener("abort", onAbort, { once: true });
					if (task === "first") {
						void firstShouldFinish.promise.then(() => {
							if (!signal?.aborted) {
								resume(Effect.succeed(`done:${task}`));
							}
						});
					} else {
						resume(Effect.succeed(`done:${task}`));
					}
					return Effect.sync(() => {
						signal?.removeEventListener("abort", onAbort);
					});
				},
			);

		const tool = makeFlowBatchTool(queue, fakeExecute);
		const controller = new AbortController();
		const execution = tool.execute(
			"batch-wait-cancel",
			{
				items: [{ profile: "explore", task: "first" }, { profile: "explore", task: "second" }],
				parallel: false,
			},
			controller.signal,
			undefined,
			{},
		);

		await firstStarted.promise;
		await sleep(20);
		controller.abort();

		const result = await execution;
		const jobs = await Effect.runPromise(queue.getAll());

		expect(result.details).toMatchObject({ status: "cancelled", cancelCount: 2, successCount: 0, failCount: 0 });
		expect(executedTasks).toEqual(["first"]);
		expect(jobs.filter((job) => job.status === "cancelled").length).toBe(2);
		expect(jobs.filter((job) => job.status === "running").length).toBe(0);
		firstShouldFinish.resolve();
	});

	it("parallel mode handles cancellation mid-batch", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

		const tool = makeFlowBatchTool(queue, ({ signal }: ExecuteOptions) =>
			Effect.promise(async () => {
				for (let i = 0; i < 20; i += 1) {
					if (signal?.aborted) {
						throw new FlowCancelledError({ reason: "Flow cancelled." });
					}
					await sleep(5);
				}
				return "ok";
			}),
		);

		const controller = new AbortController();
		const execution = tool.execute(
			"batch-parallel-cancel",
			{
				items: Array.from({ length: 6 }, (_, index) => ({
					profile: "explore",
					task: `task-${index}`,
				})),
				parallel: true,
			},
			controller.signal,
			undefined,
			{},
		);

		await sleep(20);
		controller.abort();
		const result = await execution;
		expect(result.details?.status).toBe("cancelled");
	});
});
