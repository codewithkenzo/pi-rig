import { describe, expect, it } from "bun:test";
import { selectActivityDisplayRows, selectCoordinatorDetail, selectQueueRailRows } from "../src/deck/selectors.js";
import type { FlowActivityRow } from "../src/deck/journal.js";
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

describe("selectActivityDisplayRows", () => {
	const mapOne = (row: FlowActivityRow, overrides: Partial<FlowJob> = {}) =>
		selectActivityDisplayRows([row], job("selected", overrides))[0];

	it("maps tool and assistant rows into deck taxonomy", () => {
		expect(mapOne({ ts: 1_000, kind: "tool_start", label: "grep", text: "scan repo", tone: "active" })).toMatchObject({
			marker: ">",
			chip: "TOOL CALL",
			label: "grep",
			detail: "scan repo",
			tone: "active",
		});
		expect(mapOne({ ts: 1_000, kind: "tool_end", label: "grep", text: "3 matches", tone: "success" })).toMatchObject({
			marker: "+",
			chip: "TOOL RESULT",
			label: "grep",
			detail: "3 matches",
			tone: "success",
		});
		expect(mapOne({ ts: 1_000, kind: "assistant", text: "implemented selector", tone: "default" }, { profile: "coder" })).toMatchObject({
			marker: "-",
			chip: "MESSAGE",
			label: "coder",
			detail: "implemented selector",
			tone: "default",
		});
	});

	it("maps progress/status/system rows by tone", () => {
		expect(mapOne({ ts: 1_000, kind: "progress", text: "running tools", tone: "active" })).toMatchObject({
			chip: "STATUS",
			label: "progress",
			tone: "active",
		});
		expect(mapOne({ ts: 1_000, kind: "status", label: "pending", text: "queued", tone: "muted" })).toMatchObject({
			chip: "INFO",
			label: "pending",
			marker: ".",
		});
		expect(mapOne({ ts: 1_000, kind: "system", text: "runtime checkpoint", tone: "warning" })).toMatchObject({
			chip: "WARNING",
			label: "system",
			marker: "!",
		});
	});

	it("maps summary and budget warnings explicitly", () => {
		expect(mapOne({ ts: 1_000, kind: "summary", text: "Writing summary…", tone: "warning" })).toMatchObject({
			chip: "SUMMARY",
			label: "summary",
			marker: "!",
		});
		expect(mapOne({ ts: 1_000, kind: "system", label: "budget", text: "8/10 tools", tone: "active" })).toMatchObject({
			chip: "WARNING",
			label: "budget",
			marker: "!",
			tone: "warning",
		});
	});

	it("adds agent started row only from real started job", () => {
		expect(selectActivityDisplayRows([], job("pending", { status: "pending" }))).toHaveLength(0);
		expect(selectActivityDisplayRows([], job("running", { status: "running", startedAt: 2_000 }))[0]).toMatchObject({
			timestamp: "+0s",
			chip: "AGENT STARTED",
			label: "explore",
			detail: "task-running",
			marker: ">",
		});
	});
});

describe("selectCoordinatorDetail", () => {
	it("handles undefined selected job without future placeholders", () => {
		const detail = selectCoordinatorDetail(undefined);
		expect(detail.title).toBe("DETAIL / SELECTED FLOW");
		expect(detail.sections).toHaveLength(1);
		expect(detail.sections[0]?.title).toBe("CURRENT STATE");
		expect(detail.sections[0]?.rows[0]).toEqual({ label: "state", value: "No selected flow job." });
		expect(JSON.stringify(detail).toLowerCase()).not.toMatch(/context packets|artifacts|topology|orchestrator/);
	});

	it("handles minimal old FlowJob with task fallback only", () => {
		const minimal: FlowJob = {
			id: "old-job",
			profile: "explore",
			task: "map the repo",
			status: "done",
			createdAt: 1_000,
		};
		const detail = selectCoordinatorDetail(minimal, [], { now: 2_000 });
		const allRows = detail.sections.flatMap((section) => section.rows);
		expect(detail.selectedId).toBe("old-job");
		expect(allRows).toContainEqual({ label: "status", value: "done", tone: "success" });
		expect(allRows).toContainEqual({ label: "profile", value: "explore" });
		expect(allRows).toContainEqual({ label: "task", value: "map the repo" });
		expect(allRows).toContainEqual({ label: "source", value: "task" });
		expect(allRows).toContainEqual({ label: "terminal", value: "done", tone: "success" });
		expect(allRows.some((row) => row.label === "model")).toBe(false);
	});

	it("derives rich job state, budget, timestamps, tools, and journal signals", () => {
		const rich = job("rich", {
			profile: "coder",
			agent: "builder",
			task: "implement detail selector",
			createdAt: 1_000,
			startedAt: 2_000,
			toolCount: 7,
			lastProgress: "editing summary",
			lastAssistantText: "selector ready",
			recentTools: ["read", "edit"],
			writingSummary: true,
			summaryPhaseSource: "explicit",
			envelope: {
				model: "gpt-5.5",
				provider: "openai",
				reasoning: "high",
				effort: "medium",
				requestedMaxIterations: 30,
				maxIterations: 35,
				maxToolCalls: 12,
				runtimeWarningMs: 60_000,
				maxRuntimeMs: 120_000,
			},
		});
		const rows: FlowActivityRow[] = [
			{ ts: 2_500, kind: "tool_start", label: "read", text: "inspect selectors", tone: "active" },
			{ ts: 3_000, kind: "tool_end", label: "read", text: "done", tone: "success" },
		];
		const detail = selectCoordinatorDetail(rich, rows, { now: 4_000 });
		const allRows = detail.sections.flatMap((section) => section.rows);
		expect(allRows).toContainEqual({ label: "model", value: "gpt-5.5@openai" });
		expect(allRows).toContainEqual({ label: "reasoning", value: "high" });
		expect(allRows).toContainEqual({ label: "tool count", value: "7" });
		expect(allRows).toContainEqual({ label: "tools", value: "7/12" });
		expect(allRows).toContainEqual({ label: "runtime warn", value: "1m" });
		expect(allRows).toContainEqual({ label: "max runtime", value: "2m" });
		expect(allRows).toContainEqual({ label: "phase", value: "writing-summary:explicit", tone: "warning" });
		expect(allRows).toContainEqual({ label: "TOOL CALL", value: "+1s > read: inspect selectors", tone: "active" });
		expect(allRows).toContainEqual({ label: "TOOL RESULT", value: "+1s + read: done", tone: "success" });
		expect(allRows).toContainEqual({ label: "recent tools", value: "read, edit" });
	});

	it("prioritizes error for failed jobs and output for done jobs", () => {
		const failed = selectCoordinatorDetail(job("failed", { status: "failed", error: "boom", lastAssistantText: "ignored" }));
		const failedRows = failed.sections.flatMap((section) => section.rows);
		expect(failedRows).toContainEqual({ label: "source", value: "error" });
		expect(failedRows).toContainEqual({ label: "text", value: "boom" });
		expect(failedRows).toContainEqual({ label: "terminal", value: "failed", tone: "error" });

		const done = selectCoordinatorDetail(job("done", { status: "done", output: "shipped", lastAssistantText: "ignored" }));
		const doneRows = done.sections.flatMap((section) => section.rows);
		expect(doneRows).toContainEqual({ label: "source", value: "output" });
		expect(doneRows).toContainEqual({ label: "text", value: "shipped" });
		expect(doneRows).toContainEqual({ label: "terminal", value: "done", tone: "success" });
	});
});

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
