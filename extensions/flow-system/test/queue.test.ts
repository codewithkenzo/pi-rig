import { describe, it, expect } from "bun:test";
import { Effect } from "effect";
import { makeQueue } from "../src/queue.js";
import { JobNotFoundError } from "../src/types.js";
import type { FlowJob } from "../src/types.js";

describe("FlowQueueService", () => {
	it("enqueue creates a pending job with correct profile and task", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const job = await Effect.runPromise(queue.enqueue("explore", "list files"));

		expect(job.status).toBe("pending");
		expect(job.profile).toBe("explore");
		expect(job.task).toBe("list files");
		expect(typeof job.id).toBe("string");
		expect(job.id.length).toBeGreaterThan(0);
		expect(typeof job.createdAt).toBe("number");
	});

	it("enqueue stores cwd when provided", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const job = await Effect.runPromise(
			queue.enqueue("coder", "write tests", "/home/user/project"),
		);

		expect(job.cwd).toBe("/home/user/project");
	});

	it("enqueue omits cwd when not provided", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const job = await Effect.runPromise(queue.enqueue("debug", "trace crash"));

		expect("cwd" in job).toBe(false);
	});

	it("getAll returns all enqueued jobs", async () => {
		const queue = await Effect.runPromise(makeQueue());

		await Effect.runPromise(queue.enqueue("explore", "job one"));
		await Effect.runPromise(queue.enqueue("coder", "job two"));
		await Effect.runPromise(queue.enqueue("debug", "job three"));

		const all = await Effect.runPromise(queue.getAll());
		expect(all).toHaveLength(3);
		expect(all.map((j) => j.task)).toEqual(["job one", "job two", "job three"]);
	});

	it("getAll returns empty array on a fresh queue", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const all = await Effect.runPromise(queue.getAll());
		expect(all).toHaveLength(0);
	});

	it("setStatus updates the job status", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const job = await Effect.runPromise(queue.enqueue("explore", "find files"));

		await Effect.runPromise(queue.setStatus(job.id, "running"));

		const all = await Effect.runPromise(queue.getAll());
		expect(all[0]?.status).toBe("running");
	});

	it("setStatus merges extra fields", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const job = await Effect.runPromise(queue.enqueue("coder", "write code"));
		const now = Date.now();

		await Effect.runPromise(
			queue.setStatus(job.id, "done", {
				startedAt: now - 1000,
				finishedAt: now,
				output: "all done",
			}),
		);

		const all = await Effect.runPromise(queue.getAll());
		const updated = all[0];
		expect(updated?.status).toBe("done");
		expect(updated?.output).toBe("all done");
		expect(updated?.finishedAt).toBe(now);
	});

	it("setStatus fails with JobNotFoundError for unknown id", async () => {
		const queue = await Effect.runPromise(makeQueue());

		const result = await Effect.runPromise(
			queue.setStatus("nonexistent-id", "running").pipe(Effect.either),
		);

		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left).toBeInstanceOf(JobNotFoundError);
			expect((result.left as JobNotFoundError).id).toBe("nonexistent-id");
		}
	});

	it("cancel marks a pending job as cancelled", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const job = await Effect.runPromise(queue.enqueue("explore", "scan dir"));

		await Effect.runPromise(queue.cancel(job.id));

		const all = await Effect.runPromise(queue.getAll());
		expect(all[0]?.status).toBe("cancelled");
	});

	it("cancel marks a running job as cancelled", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const job = await Effect.runPromise(queue.enqueue("debug", "trace bug"));
		await Effect.runPromise(queue.setStatus(job.id, "running"));

		await Effect.runPromise(queue.cancel(job.id));

		const all = await Effect.runPromise(queue.getAll());
		expect(all[0]?.status).toBe("cancelled");
	});

	it("cancel does not change status of done/failed/cancelled jobs", async () => {
		const queue = await Effect.runPromise(makeQueue());

		for (const terminal of ["done", "failed", "cancelled"] as const) {
			const job = await Effect.runPromise(
				queue.enqueue("explore", `job-${terminal}`),
			);
			await Effect.runPromise(queue.setStatus(job.id, terminal));
			await Effect.runPromise(queue.cancel(job.id));
		}

		const all = await Effect.runPromise(queue.getAll());
		expect(all[0]?.status).toBe("done");
		expect(all[1]?.status).toBe("failed");
		expect(all[2]?.status).toBe("cancelled");
	});

	it("cancel fails with JobNotFoundError for unknown id", async () => {
		const queue = await Effect.runPromise(makeQueue());

		const result = await Effect.runPromise(
			queue.cancel("no-such-id").pipe(Effect.either),
		);

		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left).toBeInstanceOf(JobNotFoundError);
			expect((result.left as JobNotFoundError).id).toBe("no-such-id");
		}
	});

	it("snapshot returns the full queue state", async () => {
		const queue = await Effect.runPromise(makeQueue());
		await Effect.runPromise(queue.enqueue("research", "gather docs"));

		const snap = await Effect.runPromise(queue.snapshot());
		expect(snap.mode).toBe("sequential");
		expect(snap.jobs).toHaveLength(1);
		expect(snap.jobs[0]?.profile).toBe("research");
	});

	it("restoreFrom replaces queue state with provided jobs", async () => {
		const queue = await Effect.runPromise(makeQueue());

		// seed some jobs first
		await Effect.runPromise(queue.enqueue("explore", "old job"));

		const restoredJobs: FlowJob[] = [
			{
				id: "restored-1",
				profile: "coder",
				task: "restored task",
				status: "done",
				createdAt: 1700000000000,
				output: "completed",
			},
		];

		await Effect.runPromise(queue.restoreFrom(restoredJobs));

		const snap = await Effect.runPromise(queue.snapshot());
		expect(snap.jobs).toHaveLength(1);
		expect(snap.jobs[0]?.id).toBe("restored-1");
		expect(snap.jobs[0]?.status).toBe("done");
		expect(snap.mode).toBe("sequential");
	});

	it("each queue instance is independent", async () => {
		const q1 = await Effect.runPromise(makeQueue());
		const q2 = await Effect.runPromise(makeQueue());

		await Effect.runPromise(q1.enqueue("explore", "only in q1"));

		const q1Jobs = await Effect.runPromise(q1.getAll());
		const q2Jobs = await Effect.runPromise(q2.getAll());

		expect(q1Jobs).toHaveLength(1);
		expect(q2Jobs).toHaveLength(0);
	});
});
