import { Effect, Ref } from "effect";
import type { FlowJob, FlowJobStatus, FlowQueue } from "./types.js";
import { JobNotFoundError } from "./types.js";

// ── Public interface ──────────────────────────────────────────────────────────

export interface FlowQueueService {
	enqueue(profile: string, task: string, cwd?: string): Effect.Effect<FlowJob>;
	getAll(): Effect.Effect<FlowJob[]>;
	peek(): FlowQueue;
	subscribe(listener: (queue: FlowQueue) => void): () => void;
	cancel(id: string): Effect.Effect<void, JobNotFoundError>;
	setStatus(
		id: string,
		status: FlowJobStatus,
		extras?: Partial<FlowJob>,
	): Effect.Effect<void, JobNotFoundError>;
	snapshot(): Effect.Effect<FlowQueue>;
	restoreFrom(jobs: FlowJob[]): Effect.Effect<void>;
}

type QueueMutation =
	| { readonly _tag: "missing" }
	| { readonly _tag: "unchanged" }
	| { readonly _tag: "updated"; readonly next: FlowQueue };

// ── Factory ───────────────────────────────────────────────────────────────────

export const makeQueue = (): Effect.Effect<FlowQueueService> =>
	Effect.gen(function* () {
		const ref = yield* Ref.make<FlowQueue>({ jobs: [], mode: "sequential" });
		let current: FlowQueue = { jobs: [], mode: "sequential" };
		const listeners = new Set<(queue: FlowQueue) => void>();

		const publish = (next: FlowQueue): void => {
			current = next;
			for (const listener of listeners) {
				try {
					listener(next);
				} catch (error) {
					console.warn("flow queue listener error", error);
				}
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
			Ref.get(ref).pipe(Effect.map((s) => s.jobs));

		const peek = (): FlowQueue => current;

		const subscribe = (listener: (queue: FlowQueue) => void): (() => void) => {
			listeners.add(listener);
			try {
				listener(current);
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
									j.id === id ? { ...j, status: "cancelled" as FlowJobStatus } : j
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
					publish(outcome.next);
				}
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
						const terminal =
							job.status === "done" || job.status === "failed" || job.status === "cancelled";
						if (terminal) {
							return [{ _tag: "unchanged" }, s] as const;
						}
						const next = {
							...s,
							jobs: s.jobs.map((j) => j.id === id ? { ...j, ...(extras ?? {}), status } : j),
						};
						return [{ _tag: "updated", next }, next] as const;
					},
				);
				if (outcome._tag === "missing") {
					yield* Effect.fail(new JobNotFoundError({ id }));
				}
				if (outcome._tag === "updated") {
					publish(outcome.next);
				}
			});

		const snapshot = (): Effect.Effect<FlowQueue> => Ref.get(ref);

		const restoreFrom = (jobs: FlowJob[]): Effect.Effect<void> => {
			const next: FlowQueue = { jobs, mode: "sequential" };
			return Effect.gen(function* () {
				yield* Ref.set(ref, next);
				publish(next);
			});
		};

		return { enqueue, getAll, peek, subscribe, cancel, setStatus, snapshot, restoreFrom };
	});
