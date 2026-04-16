import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { stripAnsi } from "../../../shared/ui/hud.js";
import { renderFlowWidgetLines, flowStatusText, attachFlowUi } from "../src/ui.js";
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
});
