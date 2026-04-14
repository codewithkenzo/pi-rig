import { describe, expect, it } from "bun:test";
import { renderFlowWidgetLines, flowStatusText } from "../src/ui.js";

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

		expect(lines.join("\n")).toContain("coder");
		expect(lines.join("\n")).toContain("/flow status");
		expect(lines.join("\n")).toContain("/flow run <profile> -- <task>");
		expect(lines.join("\n")).toContain("chain");
	});

	it("formats a compact status line", () => {
		const status = flowStatusText({
			mode: "sequential",
			jobs: [
				{ id: "1", profile: "explore", task: "scan", status: "running", createdAt: 1 },
				{ id: "2", profile: "debug", task: "trace", status: "pending", createdAt: 2 },
			],
		});

		expect(status).toContain("run 1");
		expect(status).toContain("wait 1");
		expect(status).toContain("▶explore");
	});
});
