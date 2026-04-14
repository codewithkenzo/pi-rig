import { Effect, Ref } from "effect";
import type { FlowJob, FlowJobStatus, FlowQueue } from "./types.js";
import { JobNotFoundError } from "./types.js";

// ── Public interface ──────────────────────────────────────────────────────────

export interface FlowQueueService {
	enqueue(profile: string, task: string, cwd?: string): Effect.Effect<FlowJob>;
	getAll(): Effect.Effect<FlowJob[]>;
	cancel(id: string): Effect.Effect<void, JobNotFoundError>;
	setStatus(
		id: string,
		status: FlowJobStatus,
		extras?: Partial<FlowJob>,
	): Effect.Effect<void, JobNotFoundError>;
	snapshot(): Effect.Effect<FlowQueue>;
	restoreFrom(jobs: FlowJob[]): Effect.Effect<void>;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export const makeQueue = (): Effect.Effect<FlowQueueService> =>
	Effect.gen(function* () {
		const ref = yield* Ref.make<FlowQueue>({ jobs: [], mode: "sequential" });

		const enqueue = (
			profile: string,
			task: string,
			cwd?: string,
		): Effect.Effect<FlowJob> =>
			Effect.gen(function* () {
				const job: FlowJob = {
					id: crypto.randomUUID(),
					profile,
					task,
					...(cwd !== undefined ? { cwd } : {}),
					status: "pending",
					createdAt: Date.now(),
				};
				yield* Ref.update(ref, (s) => ({ ...s, jobs: [...s.jobs, job] }));
				return job;
			});

		const getAll = (): Effect.Effect<FlowJob[]> =>
			Ref.get(ref).pipe(Effect.map((s) => s.jobs));

		const cancel = (id: string): Effect.Effect<void, JobNotFoundError> =>
			Effect.gen(function* () {
				const state = yield* Ref.get(ref);
				const job = state.jobs.find((j) => j.id === id);
				if (job === undefined) {
					yield* Effect.fail(new JobNotFoundError({ id }));
					return;
				}
				if (job.status === "pending" || job.status === "running") {
					yield* Ref.update(ref, (s) => ({
						...s,
						jobs: s.jobs.map((j) =>
							j.id === id ? { ...j, status: "cancelled" as FlowJobStatus } : j,
						),
					}));
				}
			});

		const setStatus = (
			id: string,
			status: FlowJobStatus,
			extras?: Partial<FlowJob>,
		): Effect.Effect<void, JobNotFoundError> =>
			Effect.gen(function* () {
				const state = yield* Ref.get(ref);
				const exists = state.jobs.some((j) => j.id === id);
				if (!exists) {
					yield* Effect.fail(new JobNotFoundError({ id }));
					return;
				}
				yield* Ref.update(ref, (s) => ({
					...s,
					jobs: s.jobs.map((j) =>
						j.id === id ? { ...j, ...(extras ?? {}), status } : j,
					),
				}));
			});

		const snapshot = (): Effect.Effect<FlowQueue> => Ref.get(ref);

		const restoreFrom = (jobs: FlowJob[]): Effect.Effect<void> => {
			const next: FlowQueue = { jobs, mode: "sequential" };
			return Ref.set(ref, next);
		};

		return { enqueue, getAll, cancel, setStatus, snapshot, restoreFrom };
	});
