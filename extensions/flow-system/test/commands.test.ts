import { describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { Effect } from "effect";
import { makeQueue } from "../src/queue.js";
import { registerFlowCommands } from "../src/commands.js";
import { FlowCancelledError } from "../src/types.js";
import type { ExecuteOptions } from "../src/executor.js";

type FlowCommandHandler = (args: string, ctx: ExtensionCommandContext) => Promise<void>;

type Deferred = {
	promise: Promise<void>;
	resolve: () => void;
};

const deferred = (): Deferred => {
	let resolve: () => void = () => undefined;
	const promise = new Promise<void>((res) => {
		resolve = res;
	});
	return { promise, resolve };
};

const makeHarness = async (options?: {
	runFlow?: (options: ExecuteOptions) => ReturnType<typeof Effect.succeed<string>> | Effect.Effect<string, FlowCancelledError>;
	queueOptions?: { maxConcurrent?: number };
	cwd?: string;
}) => {
	const queue = await Effect.runPromise(makeQueue(options?.queueOptions));
	let flowHandler: FlowCommandHandler | undefined;
	const shortcuts: string[] = [];

	const pi: Pick<ExtensionAPI, "registerCommand" | "registerShortcut"> = {
		registerCommand: (name, options) => {
			if (name === "flow") {
				flowHandler = options.handler;
			}
		},
		registerShortcut: (shortcut, _options) => {
			shortcuts.push(shortcut);
		},
	};

	registerFlowCommands(pi as ExtensionAPI, queue, options?.runFlow);

	const messages: string[] = [];
	const ctx = {
		cwd: options?.cwd ?? process.cwd(),
		ui: {
			theme: { name: "catppuccin-mocha" },
			notify: (message: string) => {
				messages.push(message);
			},
			select: async () => undefined,
			input: async () => undefined,
			setWorkingMessage: () => undefined,
		},
	} as unknown as ExtensionCommandContext;

	return { queue, flowHandler, shortcuts, messages, ctx };
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const waitUntil = async (condition: () => boolean, timeoutMs = 200): Promise<void> => {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() > deadline) {
			throw new Error("Timed out waiting for test condition");
		}
		await sleep(5);
	}
};

describe("/flow command", () => {
	it("registers the interactive flow shortcut", async () => {
		const { shortcuts } = await makeHarness();
		expect(shortcuts).toContain("alt+shift+f");
	});

	it("shows run usage for malformed run args", async () => {
		const { flowHandler, messages, ctx } = await makeHarness();
		expect(flowHandler).toBeDefined();

		await flowHandler?.("run coder", ctx);

		expect(messages.at(-1)).toContain("/flow run <profile> -- <task>");
	});

	it("fails early when /flow run profile resolves without model", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-cmd-envelope-"));
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
			const { flowHandler, messages, ctx, queue } = await makeHarness({
				cwd: tempDir,
				runFlow: () => {
					invoked = true;
					return Effect.succeed("should-not-run");
				},
			});
			expect(flowHandler).toBeDefined();
			await flowHandler?.("run local-no-model -- inspect", ctx);
			expect(messages.at(-1)).toContain("requires a concrete model + reasoning/effort envelope");
			expect(invoked).toBe(false);
			expect(queue.peek().jobs).toHaveLength(0);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("passes resolved envelope system prompt into /flow run execution", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-cmd-envelope-"));
		try {
			await fs.mkdir(path.join(tempDir, ".pi"), { recursive: true });
			await fs.writeFile(
				path.join(tempDir, ".pi", "flow-profiles.json"),
				JSON.stringify([
					{
						name: "explore",
						reasoning_level: "low",
						model: "gpt-5.4-mini",
						toolsets: ["terminal", "file"],
						skills: [],
					},
				]),
				"utf8",
			);
			let observed: ExecuteOptions | undefined;
			const { flowHandler, ctx } = await makeHarness({
				cwd: tempDir,
				runFlow: (options: ExecuteOptions) => {
					observed = options;
					return Effect.succeed("ok");
				},
			});
			expect(flowHandler).toBeDefined();
			await flowHandler?.("run explore -- inspect project", ctx);
			expect(observed).toBeDefined();
			expect(observed?.model).toBe("gpt-5.4-mini");
			expect(observed?.reasoning).toBe("low");
			expect(observed?.systemPrompt).toContain("[flow execution envelope]");
			expect(observed?.systemPrompt).toContain("maxIterations:");
			expect(observed?.systemPrompt).toContain("model: gpt-5.4-mini");
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("can filter status by id prefix", async () => {
		const { queue, flowHandler, messages, ctx } = await makeHarness();
		expect(flowHandler).toBeDefined();

		const job = await Effect.runPromise(queue.enqueue("coder", "implement queue"));
		await flowHandler?.(`status ${job.id.slice(0, 8)}`, ctx);

		expect(messages.at(-1)).toContain(job.id);
		expect(messages.at(-1)).toContain("coder");
	});

	it("shows output preview for single status lookup", async () => {
		const { queue, flowHandler, messages, ctx } = await makeHarness();
		expect(flowHandler).toBeDefined();

		const job = await Effect.runPromise(queue.enqueue("research", "summarize docs"));
		await Effect.runPromise(
			queue.setStatus(job.id, "running", {
				startedAt: Date.now() - 1000,
				toolCount: 2,
				lastProgress: "read done",
			}),
		);
		await Effect.runPromise(
			queue.setStatus(job.id, "done", {
				finishedAt: Date.now(),
				output: "docs summary complete",
				toolCount: 2,
			}),
		);

		await flowHandler?.(`status ${job.id}`, ctx);
		const message = messages.at(-1) ?? "";
		expect(message).toContain("Output preview");
		expect(message).toContain("docs summary complete");
		expect(message).toContain("tools 2");
	});

	it("does not exceed maxConcurrent=1 for concurrent /flow run invocations", async () => {
		const startedFirst = deferred();
		const startedSecond = deferred();
		const proceedFirst = deferred();
		const proceedSecond = deferred();
		let invocationCount = 0;
		let runningCount = 0;
		let maxObservedRunning = 0;

		const fakeExecute = ({ signal }: ExecuteOptions) =>
			Effect.promise(async () => {
				const index = ++invocationCount;
				runningCount += 1;
				maxObservedRunning = Math.max(maxObservedRunning, runningCount);
				if (index === 1) {
					startedFirst.resolve();
					await proceedFirst.promise;
				} else {
					startedSecond.resolve();
					await proceedSecond.promise;
				}
				if (signal?.aborted) {
					throw new FlowCancelledError({ reason: "Flow cancelled." });
				}
				runningCount -= 1;
				return "ok";
			});

		const { flowHandler, ctx, queue } = await makeHarness({
			runFlow: fakeExecute,
			queueOptions: { maxConcurrent: 1 },
		});
		expect(flowHandler).toBeDefined();

		const first = flowHandler?.("run explore -- inspect A", ctx);
		const second = flowHandler?.("run explore -- inspect B", ctx);
		await startedFirst.promise;

		await waitUntil(() => queue.peek().jobs.length === 2);
		await sleep(5);
		expect(invocationCount).toBe(1);
		expect(runningCount).toBe(1);
		expect(maxObservedRunning).toBe(1);

		proceedFirst.resolve();
		await startedSecond.promise;
		proceedSecond.resolve();

		await Promise.all([first, second]);
		expect(invocationCount).toBe(2);
		expect(maxObservedRunning).toBe(1);
	});

	it("/flow cancel handles pending run cancelled before slot", async () => {
		const fakeExecute = (_options: ExecuteOptions) => Effect.succeed("should-not-run");
		let invocationCount = 0;
		const observed: string[] = [];
		const fakeFlow = ({}) => {
			invocationCount += 1;
			observed.push("invoked");
			return fakeExecute({} as ExecuteOptions);
		};

		const { queue, flowHandler, messages, ctx } = await makeHarness({
			runFlow: fakeFlow,
			queueOptions: { maxConcurrent: 1 },
		});
		expect(flowHandler).toBeDefined();

		await Effect.runPromise(queue.enqueue("explore", "blocker"));
		const run = flowHandler?.("run explore -- inspect later", ctx);
		await waitUntil(() => queue.peek().jobs.length >= 2);
		const pending = queue.peek().jobs.at(-1);
		expect(pending?.status).toBe("pending");
		await Effect.runPromise(queue.cancel(pending?.id ?? ""));
		await run;

		expect(invocationCount).toBe(0);
		expect(messages.some((message) => message.includes("cancelled before run"))).toBe(true);
		const after = queue.peek().jobs.find((job) => job.id === pending?.id);
		expect(after?.status).toBe("cancelled");
	});

	it("/flow run handles pending job becoming terminal before execution", async () => {
		const fakeExecute = (_options: ExecuteOptions) =>
			Effect.fail(new FlowCancelledError({ reason: "Flow cancelled." }));
		let invocationCount = 0;
		const fakeFlow = () => {
			invocationCount += 1;
			return fakeExecute({} as ExecuteOptions);
		};

		const { queue, flowHandler, messages, ctx } = await makeHarness({
			runFlow: fakeFlow,
			queueOptions: { maxConcurrent: 1 },
		});
		expect(flowHandler).toBeDefined();

		await Effect.runPromise(queue.enqueue("explore", "blocker"));
		const run = flowHandler?.("run explore -- inspect terminal", ctx);
		await waitUntil(() => queue.peek().jobs.length >= 2);
		const pending = queue.peek().jobs.at(-1);
		expect(pending?.status).toBe("pending");
		await Effect.runPromise(queue.setStatus(pending?.id ?? "", "failed", { finishedAt: Date.now(), error: "upstream" }));
		await run;

		expect(invocationCount).toBe(0);
		expect(messages.some((message) => message.includes("failed before run"))).toBe(true);
	});

	it("/flow cancel aborts an in-flight /flow run", async () => {
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

		const { queue, flowHandler, messages, ctx } = await makeHarness({ runFlow: fakeExecute });
		expect(flowHandler).toBeDefined();

		const running = flowHandler?.("run explore -- inspect repo", ctx);
		await started;

		const job = queue.peek().jobs[0];
		expect(job).toBeDefined();
		await flowHandler?.(`cancel ${job?.id}`, ctx);
		await running;

		const finalJob = queue.peek().jobs[0];
		expect(finalJob?.status).toBe("cancelled");
		expect(messages.some((message) => message.includes("Cancelled:"))).toBe(true);
		expect(messages.some((message) => message.includes("cancelled after"))).toBe(true);
	});
});
