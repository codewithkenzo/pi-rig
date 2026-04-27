import { describe, expect, it } from "bun:test";
import { stripAnsi } from "../../../shared/ui/hud.js";
import { visibleWidth } from "../src/deck/layout.js";
import { selectCompactFlowStatusLine, selectFlowStatusState } from "../src/deck/selectors.js";
import { flowStatusText } from "../src/ui.js";
import type { FlowJob, FlowQueue } from "../src/types.js";

const job = (id: string, overrides: Partial<FlowJob> = {}): FlowJob => ({
	id,
	profile: "coder",
	task: `task-${id}`,
	status: "running",
	createdAt: 1_000,
	...overrides,
});

const queue = (jobs: FlowJob[]): FlowQueue => ({ jobs, mode: "sequential" });

const compact = (snapshot: FlowQueue, maxChars?: number): string | undefined =>
	selectCompactFlowStatusLine(selectFlowStatusState(snapshot), maxChars === undefined ? {} : { maxChars });

describe("Flow Status Line v2 fixtures", () => {
	it("stays quiet when idle", () => {
		expect(compact(queue([]))).toBeUndefined();
		expect(flowStatusText(queue([]), process.cwd())).toBeUndefined();
	});

	it("renders one running flow with label, phase, detail, and hint", () => {
		expect(compact(queue([job("one", { task: "deck layout pass", lastProgress: "deck layout pass" })]))).toBe(
			"flow coder running · deck layout pass · /flow",
		);
	});

	it("renders multiple active jobs as queue counts before the hint", () => {
		expect(
			compact(
				queue([
					job("builder", { profile: "builder", task: "build deck" }),
					job("reviewer", { profile: "reviewer", task: "review deck", writingSummary: true }),
					job("scout", { profile: "scout", task: "scan refs", status: "pending" }),
				]),
			),
		).toBe("flow 2 running · writing-summary · 1 pending · 1 summary · /flow");
	});

	it("renders writing-summary checkpoint for the primary job", () => {
		expect(
			compact(
				queue([
					job("summary", {
						task: "draft final reply",
						lastProgress: "draft final reply",
						writingSummary: true,
					}),
				]),
			),
		).toBe("flow coder summary · writing-summary · draft final reply · /flow");
	});

	it("keeps budget warning ahead of low-priority detail", () => {
		expect(
			compact(
				queue([
					job("budget", {
						task: "inspect budget",
						lastProgress: "inspect budget",
						toolCount: 8,
						envelope: { reasoning: "medium", maxIterations: 40, maxToolCalls: 10 },
					}),
				]),
				68,
			),
		).toBe("flow coder running · budget:warning · inspect budget · /flow");
	});

	it("keeps capped budget even when low-priority metadata drops", () => {
		expect(
			compact(
				queue([
					job("capped", {
						task: "reached tool cap",
						lastProgress: "reached tool cap",
						toolCount: 10,
						envelope: {
							model: "gpt-5.5-super-long-model-name",
							provider: "openai",
							reasoning: "high",
							maxIterations: 40,
							maxToolCalls: 10,
						},
					}),
				]),
				72,
			),
		).toBe("flow coder running · budget:capped · reached tool cap · /flow");
	});

	it("does not show terminal-only failed or cancelled jobs in idle status", () => {
		const failed = selectFlowStatusState(queue([job("failed", { status: "failed", error: "boom" })]));
		const cancelled = selectFlowStatusState(queue([job("cancelled", { status: "cancelled" })]));

		expect(failed.phase).toBe("failed");
		expect(cancelled.phase).toBe("cancelled");
		expect(selectCompactFlowStatusLine(failed)).toBeUndefined();
		expect(selectCompactFlowStatusLine(cancelled)).toBeUndefined();
	});

	it("truncates narrow lines by dropping metadata and detail before required segments", () => {
		const line = compact(
			queue([
				job("narrow", {
					profile: "long-profile-name-for-status-line",
					task: "editing selectors with wide emoji 🚀 and very long task label",
					lastProgress: "editing selectors with wide emoji 🚀 and very long task label",
					toolCount: 10,
					envelope: {
						model: "gpt-5.5-super-long-model-name",
						provider: "openai",
						reasoning: "high",
						maxIterations: 40,
						maxToolCalls: 10,
					},
				}),
			]),
			64,
		);

		expect(line).toBe("flow long-profile-name-for-s… running · budget:capped · /flow");
		expect(visibleWidth(line ?? "")).toBeLessThanOrEqual(64);
		expect(line).not.toContain("🚀");
		expect(line).not.toContain("m:");
		expect(line).not.toContain("r:");
		expect(line).not.toContain("e:");
	});

	it("uses the compact selector for theme and no-theme status paths", () => {
		const snapshot = queue([job("theme", { task: "scan", lastProgress: "scan" })]);
		const noTheme = flowStatusText(snapshot);
		expect(noTheme).toBeDefined();
		expect(stripAnsi(flowStatusText(snapshot, process.cwd()) ?? "")).toBe(noTheme ?? "");
	});
});
