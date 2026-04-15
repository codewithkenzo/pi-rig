import { Effect, Ref } from "effect";
import type { FlowJob, FlowJobStatus, FlowQueue } from "./types.js";
import { JobNotFoundError } from "./types.js";

export interface RestoreOptions {
	normalizeStaleActive?: boolean;
	restoredAt?: number;
}

const STALE_RESTORE_PROGRESS = "stale restore: previous process not live";
const STALE_RESTORE_ERROR = "Restored active job has no live process; retry/replay is required.";

// ── Public interface ──────────────────────────────────────────────────────────

export interface FlowQueueService {
	enqueue(profile: string, task: string, cwd?: string): Effect.Effect<FlowJob>;
	getAll(): Effect.Effect<FlowJob[]>;
	peek(): FlowQueue;
	subscribe(listener: (queue: FlowQueue) => void): () => void;
	cancel(id: string): Effect.Effect<void, JobNotFoundError>;
	bindAbort(id: string, abort: () => void): Effect.Effect<FlowJobStatus, JobNotFoundError>;
	clearAbort(id: string): Effect.Effect<void>;
	setStatus(
		id: string,
		status: FlowJobStatus,
		extras?: Partial<FlowJob>,
	): Effect.Effect<void, JobNotFoundError>;
	snapshot(): Effect.Effect<FlowQueue>;
	restoreFrom(jobs: FlowJob[], options?: RestoreOptions): Effect.Effect<void>;
}

type QueueMutation =
	| { readonly _tag: "missing" }
	| { readonly _tag: "unchanged" }
	| { readonly _tag: "updated"; readonly next: FlowQueue };

const isTerminalStatus = (status: FlowJobStatus): boolean =>
	status === "done" || status === "failed" || status === "cancelled";

const normalizeStaleRestoredJobs = (
	jobs: readonly FlowJob[],
	restoredAt: number,
): FlowJob[] =>
	jobs.map((job) => {
		if (job.status !== "pending" && job.status !== "running") {
			return job;
		}
		return {
			...job,
			status: "failed",
			finishedAt: job.finishedAt ?? restoredAt,
			lastProgress: STALE_RESTORE_PROGRESS,
			error: job.error ?? STALE_RESTORE_ERROR,
		};
	});

// ── Factory ───────────────────────────────────────────────────────────────────

/** Shallow-clone a FlowQueue so external holders cannot mutate internal state. */
const cloneQueue = (q: FlowQueue): FlowQueue => ({
	...q,
	jobs: q.jobs.map((j) => ({ ...j })),
});

export const makeQueue = (): Effect.Effect<FlowQueueService> =>
	Effect.gen(function* () {
		const ref = yield* Ref.make<FlowQueue>({ jobs: [], mode: "sequential" });
		let current: FlowQueue = { jobs: [], mode: "sequential" };
		const listeners = new Set<(queue: FlowQueue) => void>();
		const aborts = new Map<string, () => void>();

		const publish = (next: FlowQueue): void => {
			current = next;
			// Clone before delivery — listeners must not mutate internal queue state.
			const snapshot = cloneQueue(next);
			for (const listener of listeners) {
				try {
					listener(snapshot);
				} catch (error) {
					console.warn("flow queue listener error", error);
				}
			}
		};

		const runAbort = (id: string): void => {
			const abort = aborts.get(id);
			aborts.delete(id);
			if (abort === undefined) {
				return;
			}
			try {
				abort();
			} catch (error) {
				console.warn("flow queue abort handler error", error);
			}
		};

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
				const next = yield* Ref.updateAndGet(ref, (state) => ({
					...state,
					jobs: [...state.jobs, job],
				}));
				publish(next);
				return job;
			});

		const getAll = (): Effect.Effect<FlowJob[]> =>
			Ref.get(ref).pipe(Effect.map((s) => s.jobs.map((j) => ({ ...j }))));

		const peek = (): FlowQueue => cloneQueue(current);

		const subscribe = (listener: (queue: FlowQueue) => void): (() => void) => {
			listeners.add(listener);
			try {
				listener(cloneQueue(current));
			} catch (error) {
				console.warn("flow queue listener error", error);
			}
			return () => {
				listeners.delete(listener);
			};
		};

		const cancel = (id: string): Effect.Effect<void, JobNotFoundError> =>
			Effect.gen(function* () {
				const outcome = yield* Ref.modify(
					ref,
					(s): readonly [QueueMutation, FlowQueue] => {
						const job = s.jobs.find((j) => j.id === id);
						if (job === undefined) {
							return [{ _tag: "missing" }, s] as const;
						}
						if (job.status === "pending" || job.status === "running") {
							const next = {
								...s,
								jobs: s.jobs.map((j) =>
									j.id === id
										? {
											...j,
											status: "cancelled" as FlowJobStatus,
											lastProgress: "cancelled",
										}
										: j,
								),
							};
							return [{ _tag: "updated", next }, next] as const;
						}
						return [{ _tag: "unchanged" }, s] as const;
					},
				);
				if (outcome._tag === "missing") {
					yield* Effect.fail(new JobNotFoundError({ id }));
				}
				if (outcome._tag === "updated") {
					runAbort(id);
					publish(outcome.next);
				}
			});

		const bindAbort = (id: string, abort: () => void): Effect.Effect<FlowJobStatus, JobNotFoundError> =>
			Effect.gen(function* () {
				const status = yield* Ref.get(ref).pipe(
					Effect.flatMap((state) => {
						const job = state.jobs.find((candidate) => candidate.id === id);
						if (job === undefined) {
							return Effect.fail(new JobNotFoundError({ id }));
						}
						return Effect.succeed(job.status);
					}),
				);
				if (status === "pending" || status === "running") {
					aborts.set(id, abort);
				} else if (status === "cancelled") {
					try {
						abort();
					} catch (error) {
						console.warn("flow queue abort handler error", error);
					}
				}
				return status;
			});

		const clearAbort = (id: string): Effect.Effect<void> =>
			Effect.sync(() => {
				aborts.delete(id);
			});

		const setStatus = (
			id: string,
			status: FlowJobStatus,
			extras?: Partial<FlowJob>,
		): Effect.Effect<void, JobNotFoundError> =>
			Effect.gen(function* () {
				const outcome = yield* Ref.modify(
					ref,
					(s): readonly [QueueMutation, FlowQueue] => {
						const job = s.jobs.find((j) => j.id === id);
						if (job === undefined) {
							return [{ _tag: "missing" }, s] as const;
						}
						if (isTerminalStatus(job.status)) {
							if (job.status === "cancelled" && status === "cancelled" && extras !== undefined) {
								const next = {
									...s,
									jobs: s.jobs.map((j) =>
										j.id === id ? { ...j, ...extras, status } : j,
									),
								};
								return [{ _tag: "updated", next }, next] as const;
							}
							return [{ _tag: "unchanged" }, s] as const;
						}
						const next = {
							...s,
							jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...(extras ?? {}), status } : j)),
						};
						return [{ _tag: "updated", next }, next] as const;
					},
				);
				if (outcome._tag === "missing") {
					yield* Effect.fail(new JobNotFoundError({ id }));
				}
				if (outcome._tag === "updated") {
					if (isTerminalStatus(status)) {
						aborts.delete(id);
					}
					publish(outcome.next);
				}
			});

		const snapshot = (): Effect.Effect<FlowQueue> => Ref.get(ref).pipe(Effect.map(cloneQueue));

		const restoreFrom = (jobs: FlowJob[], options?: RestoreOptions): Effect.Effect<void> => {
			const normalizedJobs =
				options?.normalizeStaleActive === true
					? normalizeStaleRestoredJobs(jobs, options.restoredAt ?? Date.now())
					: jobs;
			const next: FlowQueue = { jobs: normalizedJobs, mode: "sequential" };
			return Effect.gen(function* () {
				aborts.clear();
				yield* Ref.set(ref, next);
				publish(next);
			});
		};

		return { enqueue, getAll, peek, subscribe, cancel, bindAbort, clearAbort, setStatus, snapshot, restoreFrom };
	});
