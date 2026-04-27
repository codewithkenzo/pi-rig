import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { stripAnsi } from "../../../shared/ui/hud.js";
import { visibleWidth } from "../src/deck/layout.js";
import { renderFlowWidgetLines, flowStatusText, attachFlowUi, suspendFlowHud, createFlowWidgetFactory } from "../src/ui.js";
import { makeQueue } from "../src/queue.js";

describe("flow UI helpers", () => {
	it("renders running jobs and commands", () => {
		const lines = renderFlowWidgetLines(
			{
				mode: "sequential",
				jobs: [
					{
						id: "job-1",
						profile: "coder",
						task: "implement queue widget",
						status: "running",
						createdAt: Date.now(),
					},
				],
			},
			process.cwd(),
			{ frame: 1, startedAt: Date.now() - 100 },
		);
		const rendered = stripAnsi(lines.join("\n"));

		expect(rendered).toContain("coder");
		expect(rendered).toContain("implement queue widget");
		expect(rendered).toContain("alt+shift+f manage");
	});

	it("formats a compact status line", () => {
		const status = flowStatusText({
			mode: "sequential",
			jobs: [
				{ id: "1", profile: "explore", task: "scan", status: "running", createdAt: 1 },
				{ id: "2", profile: "debug", task: "trace", status: "pending", createdAt: 2 },
			],
		});

		expect(status).toContain("explore");
		expect(status).toContain("scan");
	});

	it("includes model, reasoning, and effort in status line", () => {
		const status = flowStatusText({
			mode: "sequential",
			jobs: [
				{
					id: "1",
					profile: "coder",
					task: "scan",
					status: "running",
					createdAt: 1,
					envelope: {
						reasoning: "high",
						maxIterations: 84,
						model: "gpt-5.4",
						provider: "openai",
					},
				},
			],
		});

		expect(status).toContain("m:gpt-5.4@openai");
		expect(status).toContain("r:high");
		expect(status).toContain("e:auto");
	});

	it("shows writing-summary indicator when summary phase is active", () => {
		const status = flowStatusText({
			mode: "sequential",
			jobs: [
				{
					id: "1",
					profile: "explore",
					task: "scan",
					status: "running",
					createdAt: 1,
					writingSummary: true,
					summaryPhaseSource: "heuristic",
				},
			],
		});

		expect(status).toContain("writing-summary");
	});

	it("shows writing-summary indicator even when a non-primary active job is in summary phase", () => {
		const status = flowStatusText({
			mode: "sequential",
			jobs: [
				{
					id: "1",
					profile: "explore",
					task: "scan repo",
					status: "running",
					createdAt: 1,
				},
				{
					id: "2",
					profile: "debug",
					task: "draft final response",
					status: "running",
					createdAt: 2,
					writingSummary: true,
					summaryPhaseSource: "explicit",
				},
			],
		});

		expect(status).toContain("writing-summary");
	});

	it("fits widget rows with emoji to exact terminal width", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const job = await Effect.runPromise(queue.enqueue("coder🚀", "stream emoji progress 👨‍💻 ⚙️"));
		await Effect.runPromise(queue.setStatus(job.id, "running", { lastProgress: "wide emoji update 🚀\nno row split" }));
		const component = createFlowWidgetFactory(queue, process.cwd())({ requestRender: () => {} });
		const lines = component.render(42);
		component.dispose?.();

		expect(lines.length).toBeGreaterThan(0);
		for (const line of lines) {
			expect(line).not.toContain("\n");
			expect(line).not.toContain("\t");
			expect(visibleWidth(line)).toBe(42);
		}
	});

	it("attachFlowUi updates status surface for active jobs and clears on completion", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const statusCalls: Array<string | undefined> = [];
		const widgetCalls: Array<unknown> = [];
		const ctx = {
			cwd: process.cwd(),
			ui: {
				setStatus: (_key: string, value?: string) => {
					statusCalls.push(value);
				},
				setWidget: (_key: string, value?: unknown) => {
					widgetCalls.push(value);
				},
			},
		} as unknown as ExtensionContext;

		const detach = attachFlowUi(queue, ctx);
		const job = await Effect.runPromise(queue.enqueue("explore", "scan repo"));
		await Effect.runPromise(
			queue.setStatus(job.id, "running", {
				lastProgress: "writing summary…",
				writingSummary: true,
				summaryPhaseSource: "heuristic",
			}),
		);
		await Effect.runPromise(queue.setStatus(job.id, "done", { finishedAt: Date.now() }));
		detach();

		expect(statusCalls.some((value) => stripAnsi(value ?? "").includes("writing-summary"))).toBe(true);
		expect(statusCalls.at(-1)).toBeUndefined();
		expect(widgetCalls.some((value) => typeof value === "function")).toBe(true);
		expect(widgetCalls.at(-1)).toBeUndefined();
	});

	it("suspends widget and status updates while flow overlay is open, then restores them", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const statusCalls: Array<string | undefined> = [];
		const widgetCalls: Array<unknown> = [];
		const ctx = {
			cwd: process.cwd(),
			ui: {
				setStatus: (_key: string, value?: string) => {
					statusCalls.push(value);
				},
				setWidget: (_key: string, value?: unknown) => {
					widgetCalls.push(value);
				},
			},
		} as unknown as ExtensionContext;

		const detach = attachFlowUi(queue, ctx);
		const job = await Effect.runPromise(queue.enqueue("coder", "stream output"));
		await Effect.runPromise(queue.setStatus(job.id, "running", { lastProgress: "streaming…" }));
		const releaseHud = suspendFlowHud();
		await Effect.runPromise(queue.setStatus(job.id, "running", { lastProgress: "writing summary…", writingSummary: true }));
		const widgetCallsBeforeResume = widgetCalls.length;
		releaseHud();
		await Effect.runPromise(queue.setStatus(job.id, "running", { lastProgress: "resumed" }));
		detach();

		expect(widgetCalls.some((value) => typeof value === "function")).toBe(true);
		expect(statusCalls.some((value) => value === undefined)).toBe(true);
		expect(widgetCalls.length).toBeGreaterThan(widgetCallsBeforeResume);
		expect(stripAnsi(statusCalls.at(-2) ?? "")).toContain("resumed");
		expect(statusCalls.at(-1)).toBeUndefined();
	});
});
