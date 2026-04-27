import { describe, expect, it } from "bun:test";
import { selectQueueRailRows } from "../src/deck/selectors.js";
import type { FlowJob, FlowQueue } from "../src/types.js";

const job = (id: string, overrides: Partial<FlowJob> = {}): FlowJob => ({
	id,
	profile: "explore",
	task: `task-${id}`,
	status: "running",
	createdAt: 1_000,
	...overrides,
});

const queue = (jobs: FlowJob[]): FlowQueue => ({ jobs, mode: "sequential" });

describe("selectQueueRailRows", () => {
	it("derives rail row tokens from current FlowJob fields", () => {
		const rows = selectQueueRailRows(
			queue([
				job("flow_run_7f2a", {
					profile: "planner",
					task: "Plan & Decompose the mission into ordered steps for the workers",
					agent: "orch",
					status: "running",
					createdAt: 1_000,
					startedAt: 2_000,
					finishedAt: 8_000,
					toolCount: 6,
					envelope: {
						reasoning: "high",
						maxIterations: 40,
						maxToolCalls: 10,
					},
					writingSummary: true,
					summaryPhaseSource: "explicit",
				}),
			]),
			"flow_run_7f2a",
			10_000,
		);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toEqual({
			ordinal: "01",
			idHint: "7f2a",
			selected: true,
			title: "planner",
			subtitle: "Plan & Decompose the mission into ordered steps for the workers",
			statusToken: "running",
			statusTone: "active",
			proofToken: "high",
			freshnessLabel: "6s",
			budgetLabel: "6/10",
			phaseToken: "writing-summary:explicit",
		});
	});

	it("pads ordinal width across 12-job fixture and keeps selected row flagged", () => {
		const rows = selectQueueRailRows(
			queue(
				Array.from({ length: 12 }, (_, index) =>
					job(`job-${index + 1}`, {
						profile: `agent-${index + 1}`,
						status: index % 3 === 0 ? "running" : index % 3 === 1 ? "pending" : "done",
						createdAt: 1_000 + index * 1_000,
					}),
				),
			),
			"job-7",
			20_000,
		);

		expect(rows).toHaveLength(12);
		expect(rows[0]?.ordinal).toBe("01");
		expect(rows[11]?.ordinal).toBe("12");
		expect(rows[6]?.selected).toBe(true);
		expect(rows[6]?.title).toBe("agent-7");
	});

	it("keeps optional fields absent without blank tokens", () => {
		const rows = selectQueueRailRows(queue([job("old-job", { status: "done" })]), undefined, 10_000);
		expect(rows[0]).toMatchObject({
			title: "explore",
			subtitle: "task-old-job",
			statusToken: "done",
			statusTone: "success",
			proofToken: "explore",
			freshnessLabel: "9s",
		});
		expect(rows[0]?.budgetLabel).toBeUndefined();
		expect(rows[0]?.phaseToken).toBeUndefined();
	});
});
