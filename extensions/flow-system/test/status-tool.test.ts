import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { makeQueue } from "../src/queue.js";
import { makeFlowStatusTool } from "../src/status-tool.js";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("flow_status tool", () => {
	it("lists recent jobs when jobId is omitted", async () => {
		const queue = await Effect.runPromise(makeQueue());
		await Effect.runPromise(queue.enqueue("explore", "scan repo"));
		const second = await Effect.runPromise(queue.enqueue("debug", "trace failure"));
		await Effect.runPromise(
			queue.setStatus(second.id, "done", {
				finishedAt: Date.now(),
				output: "trace complete",
				toolCount: 2,
			}),
		);

		const tool = makeFlowStatusTool(queue);
		const result = await tool.execute("flow-status-list", {}, undefined, undefined, {});

		expect(result.isError ?? false).toBe(false);
		expect(result.content[0]?.text).toContain("Flow jobs (2)");
		expect(result.content[0]?.text).toContain("trace complete");
	});

	it("returns detailed single-job status with output preview", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const job = await Effect.runPromise(queue.enqueue("research", "summarize docs"));
		await Effect.runPromise(
			queue.setStatus(job.id, "done", {
				startedAt: Date.now() - 1200,
				finishedAt: Date.now(),
				output: "docs summary complete",
				toolCount: 3,
				lastProgress: "done",
			}),
		);

		const tool = makeFlowStatusTool(queue);
		const result = await tool.execute(
			"flow-status-single",
			{ jobId: job.id.slice(0, 8) },
			undefined,
			undefined,
			{},
		);

		expect(result.isError ?? false).toBe(false);
		expect(result.details).toMatchObject({ status: "done", jobId: job.id, profile: "research" });
		expect(result.content[0]?.text).toContain("output preview:");
		expect(result.content[0]?.text).toContain("docs summary complete");
	});

	it("waits for running job to finish and can include full output", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const job = await Effect.runPromise(queue.enqueue("explore", "wait for finish"));
		const tool = makeFlowStatusTool(queue);

		void sleep(30).then(() =>
			Effect.runPromise(
				queue.setStatus(job.id, "done", {
					startedAt: Date.now() - 50,
					finishedAt: Date.now(),
					output: "full background result",
					toolCount: 1,
				}),
			),
		);

		const result = await tool.execute(
			"flow-status-wait",
			{ jobId: job.id, wait: true, includeOutput: true, timeoutMs: 500 },
			undefined,
			undefined,
			{},
		);

		expect(result.isError ?? false).toBe(false);
		expect(result.details).toMatchObject({ status: "done", jobId: job.id });
		expect(result.content[0]?.text).toContain("output:");
		expect(result.content[0]?.text).toContain("full background result");
	});

	it("fails on ambiguous job id prefix", async () => {
		const queue = await Effect.runPromise(makeQueue());
		await Effect.runPromise(
			queue.restoreFrom([
				{
					id: "abc12345",
					profile: "explore",
					task: "job a",
					status: "done",
					createdAt: Date.now() - 10,
					finishedAt: Date.now() - 5,
					output: "a",
				},
				{
					id: "abc99999",
					profile: "explore",
					task: "job b",
					status: "done",
					createdAt: Date.now(),
					finishedAt: Date.now(),
					output: "b",
				},
			]),
		);
		const tool = makeFlowStatusTool(queue);

		const result = await tool.execute(
			"flow-status-ambiguous",
			{ jobId: "abc" },
			undefined,
			undefined,
			{},
		);

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("Ambiguous flow job id prefix");
	});
});
