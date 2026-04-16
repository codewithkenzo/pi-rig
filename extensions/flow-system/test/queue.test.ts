import { describe, it, expect } from "bun:test";
import { Effect } from "effect";
import { makeQueue } from "../src/queue.js";
import { FlowCancelledError, JobNotFoundError } from "../src/types.js";
import type { FlowJob } from "../src/types.js";

describe("FlowQueueService", () => {
	it("enqueue honors concurrency cap and can leave capacity for pending jobs", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const [jobOne, jobTwo] = await Promise.all([
			Effect.runPromise(queue.enqueue("explore", "first job")),
			Effect.runPromise(queue.enqueue("coder", "second job")),
		]);

		expect(jobOne.status).toBe("running");
		expect(jobTwo.status).toBe("running");
	});

	it("enqueue creates pending jobs when maxConcurrent is 1 and one job is already running", async () => {
		const queue = await Effect.runPromise(makeQueue({ maxConcurrent: 1 }));
		const first = await Effect.runPromise(queue.enqueue("explore", "root scan"));
		const second = await Effect.runPromise(queue.enqueue("explore", "nested scan"));

		expect(first.status).toBe("running");
		expect(second.status).toBe("pending");
	});

	it("promotes pending jobs after terminal transition", async () => {
		const queue = await Effect.runPromise(makeQueue({ maxConcurrent: 1 }));
		const first = await Effect.runPromise(queue.enqueue("explore", "root scan"));
		const second = await Effect.runPromise(queue.enqueue("debug", "nested scan"));

		expect(first.status).toBe("running");
		expect(second.status).toBe("pending");

		await Effect.runPromise(queue.setStatus(first.id, "done", { finishedAt: Date.now() }));
		const all = await Effect.runPromise(queue.getAll());
		expect(all.find((job) => job.id === second.id)?.status).toBe("running");
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

	it("peek and subscribe expose queue updates for UI consumers", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const seen: number[] = [];
		const unsubscribe = queue.subscribe((snapshot) => {
			seen.push(snapshot.jobs.length);
		});

		expect(queue.peek().jobs).toHaveLength(0);
		await Effect.runPromise(queue.enqueue("explore", "watch this"));
		expect(queue.peek().jobs).toHaveLength(1);

		unsubscribe();
		expect(seen).toEqual([0, 1]);
	});

	it("listener errors do not break queue updates", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const seen: number[] = [];
		const unsubscribe = queue.subscribe((snapshot) => {
			seen.push(snapshot.jobs.length);
			if (snapshot.jobs.length === 1) {
				throw new Error("listener blew up");
			}
		});

		await Effect.runPromise(queue.enqueue("explore", "listener test"));

		expect(queue.peek().jobs).toHaveLength(1);
		const all = await Effect.runPromise(queue.getAll());
		expect(all).toHaveLength(1);

		unsubscribe();
		expect(seen).toEqual([0, 1]);
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

	it("setStatus can annotate an already-cancelled job", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const job = await Effect.runPromise(queue.enqueue("debug", "interrupt me"));

		await Effect.runPromise(queue.cancel(job.id));
		await Effect.runPromise(
			queue.setStatus(job.id, "cancelled", { finishedAt: 123, toolCount: 2 }),
		);

		const all = await Effect.runPromise(queue.getAll());
		expect(all[0]?.status).toBe("cancelled");
		expect(all[0]?.finishedAt).toBe(123);
		expect(all[0]?.toolCount).toBe(2);
	});

	it("setStatus fails with JobNotFoundError for unknown id", async () => {
		const queue = await Effect.runPromise(makeQueue());

		const result = await Effect.runPromise(
			queue.setStatus("nonexistent-id", "running").pipe(Effect.result),
		);

		expect(result._tag).toBe("Failure");
		if (result._tag === "Failure") {
			expect(result.failure).toBeInstanceOf(JobNotFoundError);
			expect(result.failure.id).toBe("nonexistent-id");
		}
	});

	it("cancel marks a pending job as cancelled", async () => {
		const queue = await Effect.runPromise(makeQueue({ maxConcurrent: 1 }));
		await Effect.runPromise(queue.enqueue("explore", "running job"));
		const pending = await Effect.runPromise(queue.enqueue("explore", "pending job"));

		await Effect.runPromise(queue.cancel(pending.id));

		const all = await Effect.runPromise(queue.getAll());
		expect(all.find((job) => job.id === pending.id)?.status).toBe("cancelled");
	});


	it("does not promote pending jobs before running cancellations reach terminal state", async () => {
		const queue = await Effect.runPromise(makeQueue({ maxConcurrent: 1 }));
		const running = await Effect.runPromise(queue.enqueue("explore", "first"));
		const pending = await Effect.runPromise(queue.enqueue("debug", "second"));

		expect(running.status).toBe("running");
		expect(pending.status).toBe("pending");

		await Effect.runPromise(queue.cancel(running.id));
		const afterCancelJobs = await Effect.runPromise(queue.getAll());
		expect(afterCancelJobs.find((job) => job.id === pending.id)?.status).toBe("pending");

		await Effect.runPromise(
			queue.setStatus(running.id, "cancelled", { finishedAt: Date.now(), toolCount: 0 }),
		);
		const afterTerminal = await Effect.runPromise(queue.getAll());
		expect(afterTerminal.find((job) => job.id === pending.id)?.status).toBe("running");
	});

	it("cancel marks running jobs as cancelling until terminal status is applied", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const job = await Effect.runPromise(queue.enqueue("debug", "trace bug"));
		await Effect.runPromise(queue.setStatus(job.id, "running"));

		await Effect.runPromise(queue.cancel(job.id));

		const interim = await Effect.runPromise(queue.getAll());
		expect(interim[0]?.status).toBe("running");
		expect(interim[0]?.lastProgress).toBe("cancelling");

		await Effect.runPromise(queue.setStatus(job.id, "cancelled", { finishedAt: Date.now() }));
		const all = await Effect.runPromise(queue.getAll());
		expect(all[0]?.status).toBe("cancelled");
	});

	it("cancel triggers the bound abort handler for running jobs", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const job = await Effect.runPromise(queue.enqueue("debug", "trace bug"));
		await Effect.runPromise(queue.setStatus(job.id, "running"));

		const controller = new AbortController();
		await Effect.runPromise(queue.bindAbort(job.id, () => controller.abort()));
		await Effect.runPromise(queue.cancel(job.id));

		expect(controller.signal.aborted).toBe(true);
	});

	it("bindAbort immediately aborts when the job is already cancelled", async () => {
		const queue = await Effect.runPromise(makeQueue({ maxConcurrent: 1 }));
		await Effect.runPromise(queue.enqueue("debug", "running"));
		const job = await Effect.runPromise(queue.enqueue("debug", "already cancelled"));
		await Effect.runPromise(queue.cancel(job.id));

		const controller = new AbortController();
		const status = await Effect.runPromise(queue.bindAbort(job.id, () => controller.abort()));

		expect(status).toBe("cancelled");
		expect(controller.signal.aborted).toBe(true);
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
			queue.cancel("no-such-id").pipe(Effect.result),
		);

		expect(result._tag).toBe("Failure");
		if (result._tag === "Failure") {
			expect(result.failure).toBeInstanceOf(JobNotFoundError);
			expect(result.failure.id).toBe("no-such-id");
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

	it("restoreFrom can normalize stale pending/running jobs into non-live failed jobs", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const restoredAt = 1700000004321;

		const restoredJobs: FlowJob[] = [
			{
				id: "restored-pending",
				profile: "explore",
				task: "pending task",
				status: "pending",
				createdAt: 1700000000000,
			},
			{
				id: "restored-running",
				profile: "debug",
				task: "running task",
				status: "running",
				createdAt: 1700000000100,
				startedAt: 1700000000200,
				lastAssistantText: "partial stream text",
			},
			{
				id: "restored-done",
				profile: "coder",
				task: "done task",
				status: "done",
				createdAt: 1700000000300,
				finishedAt: 1700000000400,
				output: "ok",
			},
		];

		await Effect.runPromise(
			queue.restoreFrom(restoredJobs, { normalizeStaleActive: true, restoredAt }),
		);

		const snap = await Effect.runPromise(queue.snapshot());
		expect(snap.jobs).toHaveLength(3);

		const pending = snap.jobs[0];
		const running = snap.jobs[1];
		const done = snap.jobs[2];

		expect(pending?.status).toBe("failed");
		expect(pending?.finishedAt).toBe(restoredAt);
		expect(pending?.lastProgress).toContain("stale");
		expect(pending?.error).toContain("live process");

		expect(running?.status).toBe("failed");
		expect(running?.finishedAt).toBe(restoredAt);
		expect(running?.lastProgress).toContain("stale");
		expect(running?.error).toContain("live process");

		expect(done?.status).toBe("done");
		expect(done?.output).toBe("ok");
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

	it("survives high-contention cancel/setStatus races on one job", async () => {
		const queue = await Effect.runPromise(makeQueue());
		const job = await Effect.runPromise(queue.enqueue("debug", "race-target"));

		await Promise.all(
			Array.from({ length: 120 }, (_, index) =>
				index % 2 === 0
					? Effect.runPromise(queue.cancel(job.id).pipe(Effect.result))
					: Effect.runPromise(
							queue
								.setStatus(job.id, "running", { lastProgress: `tick-${index}` })
								.pipe(Effect.result),
						),
			),
		);

		const final = await Effect.runPromise(queue.getAll());
		const target = final.find((entry) => entry.id === job.id);
		expect(target).toBeDefined();
		expect(["running", "cancelled", "failed", "done", "pending"]).toContain(target?.status ?? "");
	});

	it("handles rapid enqueue + terminal cycles without losing bounded state", async () => {
		const queue = await Effect.runPromise(makeQueue({ maxConcurrent: 4 }));
		const rounds = 120;

		for (let index = 0; index < rounds; index += 1) {
			const job = await Effect.runPromise(queue.enqueue("explore", `burst-${index}`));
			await Effect.runPromise(
				queue.setStatus(job.id, index % 3 === 0 ? "failed" : "done", {
					finishedAt: Date.now(),
					output: `out-${index}`,
				}),
			);
		}

		const snapshot = await Effect.runPromise(queue.snapshot());
		expect(snapshot.jobs.length).toBeLessThanOrEqual(200);
		expect(snapshot.jobs.at(-1)?.task ?? "").toBe("burst-119");
	});
});
