import { describe, expect, test } from "bun:test";
import { makeNotifyCronTickTool } from "../src/tool.js";
import { validateDestination, validateEnvelope } from "../src/validation.js";
import type { NotifyCronScheduler } from "../src/scheduler.js";

const extractText = (result: { content: Array<{ type: string; text: string }> }) =>
	result.content[0]?.text ?? "";

describe("notify-cron dispatch validation", () => {
	test("validateDestination rejects malformed destination payload", () => {
		const result = validateDestination({
			platform: "telegram",
			kind: "dm",
		});
		expect(result.ok).toBeFalse();
	});

	test("validateEnvelope rejects limited network without allowlist", () => {
		const result = validateEnvelope({
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
		});
		expect(result.ok).toBeFalse();
	});

	test("tick tool fails closed when run payload is invalid at dispatch boundary", async () => {
		const scheduler: NotifyCronScheduler = {
			upsert: () => {},
			remove: () => false,
			list: () => [],
			tick: () => ({
				blockedByLease: false,
				lease: { owner: "lease-a", expiresAt: 99999 },
				runs: [
					{
						jobId: "bad-job",
						scheduledAt: 1000,
						idempotencyKey: "bad",
						destination: {
							platform: "telegram",
							kind: "dm",
							id: "",
						},
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
					},
				],
			}),
		};

		const tool = makeNotifyCronTickTool(scheduler);
		const response = await tool.execute("tick-1", { lease_owner: "lease-a", now_ms: 1000 });
		const text = extractText(response);
		expect(text).toContain("due=0");
		expect(text).toContain("invalid=1");
		expect(text).toContain("Invalid destination schema");
	});
});

