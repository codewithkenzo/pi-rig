import { describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Value } from "@sinclair/typebox/value";
import { Effect } from "effect";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { makeQueue, type FlowQueueService } from "../src/queue.js";
import { makeFlowTool } from "../src/tool.js";
import { FlowCancelledError } from "../src/types.js";
import type { ExecuteOptions } from "../src/executor.js";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const makeDeferred = (): { promise: Promise<void>; resolve: () => void } => {
	let resolve!: () => void;
	const promise = new Promise<void>((promiseResolve) => {
		resolve = promiseResolve;
	});
	return { promise, resolve };
};

const waitForJobTerminalState = async (
	queue: FlowQueueService,
	jobId: string,
): Promise<"done" | "failed" | "cancelled"> => {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		const job = (await Effect.runPromise(queue.getAll())).find((candidate) => candidate.id === jobId);
		if (job !== undefined && (job.status === "done" || job.status === "failed" || job.status === "cancelled")) {
			return job.status;
		}
		await sleep(10);
	}
	throw new Error(`timed out waiting for terminal status for ${jobId}`);
};

const makeCtx = (
	cwd = process.cwd(),
	notifyCalls?: Array<{ text: string; level?: string }>,
): ExtensionContext =>
	({
		cwd,
		hasUI: true,
		ui: {
			notify: (text: string, level?: string) => {
				notifyCalls?.push({ text, level });
			},
		},
	} as unknown as ExtensionContext);

describe("flow_run tool cancellation", () => {
	it("routes tool AbortSignal through queue cancellation and marks the job cancelled", async () => {
		const queue = await Effect.runPromise(makeQueue());
		let resolveStarted: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			resolveStarted = resolve;
		});

		const fakeExecute = ({ signal }: ExecuteOptions) =>
			Effect.callback<string, FlowCancelledError>(
				(resume: (effect: Effect.Effect<string, FlowCancelledError>) => void) => {
					resolveStarted?.();
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

		const tool = makeFlowTool(queue, fakeExecute);
		const controller = new AbortController();
		const execution = tool.execute(
			"tool-1",
			{ profile: "explore", task: "scan project" },
			controller.signal,
			undefined,
			makeCtx(),
		);

		await started;
		controller.abort();

		const result = await execution;
		const jobs = await Effect.runPromise(queue.getAll());

		expect(result.content[0]?.text).toContain("Flow cancelled");
		expect(result.details).toMatchObject({ status: "cancelled" });
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.status).toBe("cancelled");
	});

	it("handles an AbortSignal that fires during setup before execution starts", async () => {
		const queue = await Effect.runPromise(makeQueue());
		let started = false;

		const fakeExecute = (_options: ExecuteOptions) => {
			started = true;
			return Effect.succeed("should not run");
		};

		const tool = makeFlowTool(queue, fakeExecute);
		const controller = new AbortController();
		const execution = tool.execute(
			"tool-setup-cancel",
			{ profile: "explore", task: "scan project" },
			controller.signal,
			undefined,
			makeCtx(),
		);

		controller.abort();
		const result = await execution;
		const jobs = await Effect.runPromise(queue.getAll());

		expect(started).toBe(false);
		expect(result.details).toMatchObject({ status: "cancelled" });
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.status).toBe("cancelled");
	});

	it("fails early when a profile resolves without model", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-tool-envelope-"));
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
			const tool = makeFlowTool(queue, () => {
				invoked = true;
				return Effect.succeed("should-not-run");
			});
			const result = await tool.execute(
				"tool-missing-model",
				{
					profile: "local-no-model",
					task: "check model selection",
					cwd: tempDir,
				},
				undefined,
				undefined,
				makeCtx(tempDir),
			);
			const jobs = await Effect.runPromise(queue.getAll());
			expect("isError" in result ? result.isError : false).toBe(true);
			expect(result.content[0]?.text).toContain("requires a concrete model");
			expect(invoked).toBe(false);
			expect(jobs).toHaveLength(0);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("waits for queue slot before running flow_run when maxConcurrent is 1", async () => {
		const queue = await Effect.runPromise(makeQueue({ maxConcurrent: 1 }));
		let running = 0;
		let maxRunning = 0;
		const executed: string[] = [];
		const firstRunning = makeDeferred();
		const proceed = makeDeferred();
		const fakeExecute = ({ task }: ExecuteOptions) =>
			Effect.promise(async () => {
				executed.push(task);
				running += 1;
				maxRunning = Math.max(maxRunning, running);
				if (task === "first") {
					firstRunning.resolve();
				}
				await proceed.promise;
				running -= 1;
				return `done:${task}`;
			});

		const tool = makeFlowTool(queue, fakeExecute);
		const first = tool.execute(
			"tool-maxcon-1-first",
			{ profile: "explore", task: "first" },
			undefined,
			undefined,
			makeCtx(),
		);
		await firstRunning.promise;
		const second = tool.execute(
			"tool-maxcon-1-second",
			{ profile: "explore", task: "second" },
			undefined,
			undefined,
			makeCtx(),
		);

		await sleep(20);
		const jobsDuring = await Effect.runPromise(queue.getAll());
		expect(jobsDuring.filter((job) => job.status === "running")).toHaveLength(1);
		expect(jobsDuring.filter((job) => job.status === "pending")).toHaveLength(1);

		proceed.resolve();
		const results = await Promise.all([first, second]);
		expect(results.map((result) => result.details?.status)).toEqual(["done", "done"]);
		expect(maxRunning).toBe(1);
		expect(executed).toEqual(["first", "second"]);
	});

	it("does not run pending flow_run when aborted while waiting for slot", async () => {
		const queue = await Effect.runPromise(makeQueue({ maxConcurrent: 1 }));
		const firstStarted = makeDeferred();
		const allowFirstToFinish = makeDeferred();
		const secondController = new AbortController();
		const executed: string[] = [];
		const fakeExecute = ({ task }: ExecuteOptions) =>
			Effect.promise(async () => {
				executed.push(task);
				if (task === "first") {
					firstStarted.resolve();
					await allowFirstToFinish.promise;
					return `done:${task}`;
				}
				return `done:${task}`;
			});

		const tool = makeFlowTool(queue, fakeExecute);
		const first = tool.execute(
			"tool-wait-cancel-first",
			{ profile: "explore", task: "first" },
			undefined,
			undefined,
			makeCtx(),
		);

		await firstStarted.promise;
		const second = tool.execute(
			"tool-wait-cancel-second",
			{ profile: "explore", task: "second" },
			secondController.signal,
			undefined,
			makeCtx(),
		);
		await sleep(20);

		const queued = await Effect.runPromise(queue.getAll());
		expect(queued.filter((job) => job.status === "running").map((job) => job.task)).toEqual(["first"]);
		expect(queued.filter((job) => job.status === "pending")).toHaveLength(1);

		secondController.abort();
		allowFirstToFinish.resolve();

		const secondResult = await second;
		expect(secondResult.details).toMatchObject({ status: "cancelled" });
		expect(executed).toEqual(["first"]);

		await first;
		const jobs = await Effect.runPromise(queue.getAll());
		expect(jobs.filter((job) => job.status === "cancelled").map((job) => job.task)).toContain("second");
	});

	it("does not emit a failure update when background flow_run succeeds and sends a proactive completion notify", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const updates: string[] = [];
		const notifyCalls: Array<{ text: string; level?: string }> = [];
		const tool = makeFlowTool(queue, () => Effect.succeed("background ok"));
		const result = await tool.execute(
			"tool-background-success",
			{ profile: "explore", task: "background success", background: true },
			undefined,
			(update) => {
				const text = update.content[0];
				if (text?.type === "text") {
					updates.push(text.text);
				}
			},
			makeCtx(process.cwd(), notifyCalls),
		);

		expect(result.details).toMatchObject({ status: "pending", background: true });
		const jobId = result.details?.jobId;
		expect(typeof jobId).toBe("string");
		const terminal = await waitForJobTerminalState(queue, String(jobId));
		expect(terminal).toBe("done");
		expect(updates.some((line) => line.toLowerCase().includes("failed"))).toBe(false);
		expect(notifyCalls.some((call) => call.text.includes("run flow_status jobId="))).toBe(true);
		expect(notifyCalls.some((call) => call.text.includes("background ok"))).toBe(true);
	});

	it("throttles and clips high-frequency assistant text progress updates", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const longText = "assistant update ".repeat(40);
		const updateLines: string[] = [];

		const fakeExecute = ({ onProgress }: ExecuteOptions) =>
			Effect.sync(() => {
				onProgress?.({ _tag: "assistant_text", detail: `${longText} a` });
				onProgress?.({ _tag: "assistant_text", detail: `${longText} b` });
				onProgress?.({ _tag: "assistant_text", detail: `${longText} c` });
				return "done";
			});

		const tool = makeFlowTool(queue, fakeExecute);
		const result = await tool.execute(
			"tool-throttle",
			{ profile: "explore", task: "stream text" },
			undefined,
			(update) => {
				const text = update.content[0];
				if (text?.type === "text") {
					updateLines.push(text.text);
				}
			},
			makeCtx(),
		);

		expect(result.details).toMatchObject({ status: "done" });

		const progressMessages = updateLines.filter((line) => line.startsWith("explore:"));
		expect(progressMessages).toHaveLength(1);
		expect(progressMessages[0]?.length).toBeLessThan(220);

		const jobs = await Effect.runPromise(queue.getAll());
		const lastAssistantText = jobs[0]?.lastAssistantText ?? "";
		expect(lastAssistantText.length).toBeLessThan(220);
		expect(lastAssistantText.endsWith("…")).toBe(true);
	});

	it("persists recentTools on running and terminal updates", async () => {
		const queue = await Effect.runPromise(makeQueue());

		const fakeExecute = ({ onProgress }: ExecuteOptions) =>
			Effect.sync(() => {
				onProgress?.({ _tag: "tool_start", toolName: "read", detail: "starting read" });
				onProgress?.({ _tag: "tool_end", toolName: "read", detail: "done read" });
				return "ok";
			});

		const tool = makeFlowTool(queue, fakeExecute);
		await tool.execute(
			"tool-recent-tools",
			{ profile: "explore", task: "collect tools" },
			undefined,
			undefined,
			makeCtx(),
		);

		const jobs = await Effect.runPromise(queue.getAll());
		expect(jobs[0]?.status).toBe("done");
		expect(jobs[0]?.recentTools).toEqual(["read…", "read done"]);
	});

	it("uses effective metadata from executor callbacks for terminal job state", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const fakeExecute = ({ onModelFallback, onAgentPromptUnavailable }: ExecuteOptions) =>
			Effect.sync(() => {
				onModelFallback?.();
				onAgentPromptUnavailable?.();
				return "ok";
			});

		const tool = makeFlowTool(queue, fakeExecute);
		await tool.execute(
			"tool-effective-meta",
			{ profile: "explore", task: "meta test" },
			undefined,
			undefined,
			makeCtx(),
		);

		const jobs = await Effect.runPromise(queue.getAll());
		expect(jobs[0]?.status).toBe("done");
		expect((jobs[0]?.model ?? "").trim()).toBe("");
		expect((jobs[0]?.agent ?? "").trim()).toBe("");
	});

	it("keeps schema/runtime compatibility for legacy and explicit call shapes", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const tool = makeFlowTool(queue, () => Effect.succeed("ok"));

		expect(
			Value.Check(tool.parameters, {
				profile: "explore",
				task: "legacy shape",
			}),
		).toBe(true);
		expect(
			Value.Check(tool.parameters, {
				profile: "explore",
				task: "explicit shape",
				cwd: ".",
				background: false,
			}),
		).toBe(true);

		const result = await tool.execute(
			"tool-schema-fallback",
			{ profile: "explore", task: "runtime fallback" },
			undefined,
			undefined,
			makeCtx(),
		);
		expect(result.details).toMatchObject({ status: "done" });
	});
});
