import { describe, expect, it } from "bun:test";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { Effect } from "effect";
import { makeQueue } from "../src/queue.js";
import { registerFlowCommands } from "../src/commands.js";

type FlowCommandHandler = (args: string, ctx: ExtensionCommandContext) => Promise<void>;

const makeHarness = async () => {
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

	registerFlowCommands(pi as ExtensionAPI, queue);

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
});
