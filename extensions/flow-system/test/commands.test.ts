import { describe, expect, it } from "bun:test";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { Effect } from "effect";
import { makeQueue } from "../src/queue.js";
import { registerFlowCommands } from "../src/commands.js";
import { FlowCancelledError } from "../src/types.js";
import type { ExecuteOptions } from "../src/executor.js";

type FlowCommandHandler = (args: string, ctx: ExtensionCommandContext) => Promise<void>;

const makeHarness = async (options?: { runFlow?: (options: ExecuteOptions) => ReturnType<typeof Effect.succeed<string>> | Effect.Effect<string, FlowCancelledError> }) => {
	const queue = await Effect.runPromise(makeQueue());
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
		cwd: process.cwd(),
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
