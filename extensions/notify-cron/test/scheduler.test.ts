import { describe, expect, test } from "bun:test";
import { makeNotifyCronScheduler } from "../src/scheduler.js";
import type { NotifyCronJob } from "../src/types.js";

const makeJob = (id: string, everyMinutes = 5): NotifyCronJob => ({
	id,
	title: id,
	everyMinutes,
	destination: { platform: "telegram", kind: "topic", id: "-1001", threadId: "9" },
	enabled: true,
	message: `job:${id}`,
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
			network: "off",
		},
	},
});

describe("notify-cron scheduler", () => {
	test("coalesces misfires to one run", () => {
		const scheduler = makeNotifyCronScheduler();
		scheduler.upsert(makeJob("a", 10));
		const t1 = scheduler.tick("owner-1", 600_000);
		expect(t1.runs.length).toBe(1);
		const t2 = scheduler.tick("owner-1", 3_600_000);
		expect(t2.runs.length).toBe(1);
	});

	test("blocks tick when lease is held by another owner", () => {
		const scheduler = makeNotifyCronScheduler(60_000);
		scheduler.upsert(makeJob("a", 1));
		const first = scheduler.tick("owner-a", 100_000);
		expect(first.blockedByLease).toBeFalse();
		const second = scheduler.tick("owner-b", 110_000);
		expect(second.blockedByLease).toBeTrue();
	});

	test("idempotency suppresses duplicates for same slot", () => {
		const scheduler = makeNotifyCronScheduler();
		scheduler.upsert(makeJob("a", 5));
		const now = 300_000;
		const first = scheduler.tick("owner-1", now);
		expect(first.runs.length).toBe(1);
		const second = scheduler.tick("owner-1", now + 1_000);
		expect(second.runs.length).toBe(0);
	});
});
