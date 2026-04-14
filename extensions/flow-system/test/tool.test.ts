import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { makeQueue } from "../src/queue.js";
import { makeFlowTool } from "../src/tool.js";
import { FlowCancelledError } from "../src/types.js";
import type { ExecuteOptions } from "../src/executor.js";

const makeCtx = (): ExtensionContext =>
	({
		cwd: process.cwd(),
		hasUI: true,
		ui: {
			notify: () => undefined,
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
});
