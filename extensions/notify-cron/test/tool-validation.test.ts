import { describe, expect, test } from "bun:test";
import { makeNotifyCronScheduler } from "../src/scheduler.js";
import { makeNotifyCronUpsertTool } from "../src/tool.js";

const getText = (result: { content: Array<{ type: string; text: string }>; isError?: boolean }) =>
	result.content[0]?.text ?? "";

describe("notify-cron upsert validation", () => {
	test("fails closed for invalid destination", async () => {
		const scheduler = makeNotifyCronScheduler();
		const tool = makeNotifyCronUpsertTool(scheduler);
		const result = await tool.execute("call-1", {
			id: "job-a",
			title: "job-a",
			every_minutes: 5,
			destination: "invalid-destination",
			message: "hello",
		});

		expect(result.isError).toBeTrue();
		expect(getText(result)).toContain("Invalid destination");
	});

	test("rejects network=limited envelope without allowlist", async () => {
		const scheduler = makeNotifyCronScheduler();
		const tool = makeNotifyCronUpsertTool(scheduler);
		const result = await tool.execute("call-2", {
			id: "job-b",
			title: "job-b",
			every_minutes: 5,
			destination: "telegram:-1001:9",
			message: "hello",
			envelope: {
				model: "claude-sonnet-4-6",
				reasoning: "medium",
				maxIterations: 20,
				preload: {},
				skills: [],
				toolsets: [],
				permissions: {
					fileRead: [],
					fileWrite: [],
					network: "limited",
				},
			},
		});

		expect(result.isError).toBeTrue();
		expect(getText(result)).toContain("network=limited requires permissions.networkAllowlist");
	});

	test("accepts network=limited envelope when allowlist is provided", async () => {
		const scheduler = makeNotifyCronScheduler();
		const tool = makeNotifyCronUpsertTool(scheduler);
		const result = await tool.execute("call-3", {
			id: "job-c",
			title: "job-c",
			every_minutes: 5,
			destination: "telegram:-1001:9",
			message: "hello",
			envelope: {
				model: "claude-sonnet-4-6",
				reasoning: "medium",
				maxIterations: 20,
				preload: {},
				skills: [],
				toolsets: [],
				permissions: {
					fileRead: [],
					fileWrite: [],
					network: "limited",
					networkAllowlist: ["api.telegram.org"],
				},
			},
		});

		expect(result.isError).toBeUndefined();
		expect(getText(result)).toContain("Upserted notify-cron job job-c");
	});
});

