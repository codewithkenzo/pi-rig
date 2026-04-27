import { Effect, Ref } from "effect";
import type { FlowJob, FlowJobStatus, FlowQueue } from "./types.js";
import { JobNotFoundError } from "./types.js";

export interface RestoreOptions {
	normalizeStaleActive?: boolean;
	restoredAt?: number;
}

export interface MakeQueueOptions {
	maxConcurrent?: number;
}

const STALE_RESTORE_PROGRESS = "stale restore: previous process not live";
const STALE_RESTORE_ERROR = "Restored active job has no live process; retry/replay is required.";
export const MAX_OUTPUT_BYTES = 64 * 1024;
export const OUTPUT_TRUNCATION_MARKER = "\n[output truncated to 65536 bytes]";

const resolveMaxConcurrent = (maxConcurrent?: number): number => {
	if (maxConcurrent !== undefined && Number.isSafeInteger(maxConcurrent) && maxConcurrent > 0) {
		return maxConcurrent;
	}
	return 5;
};

export interface FlowQueueService {
	enqueue(profile: string, task: string, cwd?: string): Effect.Effect<FlowJob>;
	getAll(): Effect.Effect<FlowJob[]>;
	peek(): FlowQueue;
	subscribe(listener: (queue: FlowQueue) => void): () => void;
	cancel(id: string): Effect.Effect<"cancelled" | "already_terminal", JobNotFoundError>;
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

const isRunningLike = (job: FlowJob, cancellingJobs: ReadonlySet<string>): boolean =>
	job.status === "running" || cancellingJobs.has(job.id);

const countRunningLike = (jobs: readonly FlowJob[], cancellingJobs: ReadonlySet<string>): number =>
	jobs.filter((job) => isRunningLike(job, cancellingJobs)).length;

const normalizeStaleRestoredJobs = (
	jobs: readonly FlowJob[],
	restoredAt: number,
): FlowJob[] =>
	jobs.map((job) => {
		if (job.status !== "pending" && job.status !== "running") {
			// Clone terminal jobs too — caller must not share references with internal queue state.
			return { ...job };
		}
		return {
			...job,
			status: "failed",
			finishedAt: job.finishedAt ?? restoredAt,
			lastProgress: STALE_RESTORE_PROGRESS,
			error: job.error ?? STALE_RESTORE_ERROR,
		};
	});

const MAX_JOBS = 200;

const pruneJobs = (jobs: readonly FlowJob[]): FlowJob[] => {
	if (jobs.length <= MAX_JOBS) {
		return jobs.map((j) => ({ ...j }));
	}
	const active = jobs.filter((j) => j.status === "pending" || j.status === "running");
	const terminal = jobs.filter((j) => j.status !== "pending" && j.status !== "running");
	const keepTerminal = terminal.slice(Math.max(0, terminal.length - (MAX_JOBS - active.length)));
	return [...active, ...keepTerminal].map((j) => ({ ...j }));
};

const truncateOutput = (output: string): string => {
	if (Buffer.byteLength(output, "utf8") <= MAX_OUTPUT_BYTES) {
		return output;
	}

	const markerBytes = Buffer.byteLength(OUTPUT_TRUNCATION_MARKER, "utf8");
	if (markerBytes >= MAX_OUTPUT_BYTES) {
		return OUTPUT_TRUNCATION_MARKER.slice(0, MAX_OUTPUT_BYTES);
	}

	const bytes = Buffer.from(output, "utf8");
	const trimmed = bytes.slice(0, MAX_OUTPUT_BYTES - markerBytes).toString("utf8");
	return `${trimmed}${OUTPUT_TRUNCATION_MARKER}`;
};

const cloneQueue = (q: FlowQueue): FlowQueue => ({
	...q,
	jobs: q.jobs.map((j) => ({ ...j })),
});

const promotePendingJobs = (
	state: FlowQueue,
	maxConcurrent: number,
	cancellingJobs: ReadonlySet<string>,
): FlowQueue => {
	const runningCount = countRunningLike(state.jobs, cancellingJobs);
	if (runningCount >= maxConcurrent) {
		return state;
	}

	let nextRunningCount = runningCount;
	const jobs: FlowJob[] = state.jobs.map((job): FlowJob => {
		if (job.status !== "pending" || nextRunningCount >= maxConcurrent) {
			return job;
		}
		nextRunningCount += 1;
		return { ...job, status: "running" };
	});

	if (nextRunningCount === runningCount) {
		return state;
	}

	return { ...state, jobs };
};

const isRunningCapReached = (
	state: FlowQueue,
	maxConcurrent: number,
	cancellingJobs: ReadonlySet<string>,
): boolean => countRunningLike(state.jobs, cancellingJobs) >= maxConcurrent;

const applyOutputCap = (extras: Partial<FlowJob> | undefined): Partial<FlowJob> | undefined => {
	if (extras?.output === undefined) {
		return extras;
	}

	return {
		...extras,
		output: truncateOutput(extras.output),
	};
};

const mergeStatusUpdate = (job: FlowJob, status: FlowJobStatus, extras: Partial<FlowJob>): FlowJob => {
	const merged: FlowJob = {
		...job,
		...extras,
		...(isTerminalStatus(status) ? { writingSummary: false } : {}),
		status,
	};
	if (merged.writingSummary === true) {
		return merged;
	}
	const { summaryPhaseSource: _summaryPhaseSource, ...withoutSummarySource } = merged;
	return withoutSummarySource;
};

const allowPendingToRunningTransition = (
	state: FlowQueue,
	job: FlowJob,
	maxConcurrent: number,
	nextStatus: FlowJobStatus,
	cancellingJobs: ReadonlySet<string>,
): boolean => {
	if (nextStatus !== "running" || job.status !== "pending") {
		return true;
	}
	return countRunningLike(state.jobs, cancellingJobs) < maxConcurrent;
};

const finalizeTerminalTransition = (
	state: FlowQueue,
	jobId: string,
	maxConcurrent: number,
	cancellingJobs: Set<string>,
	status: FlowJobStatus,
): FlowQueue => {
	if (!isTerminalStatus(status)) {
		return state;
	}

	cancellingJobs.delete(jobId);
	return promotePendingJobs(state, maxConcurrent, cancellingJobs);
};

export const makeQueue = (options?: MakeQueueOptions): Effect.Effect<FlowQueueService> =>
	Effect.gen(function* () {
		const maxConcurrent = resolveMaxConcurrent(options?.maxConcurrent);
		const ref = yield* Ref.make<FlowQueue>({ jobs: [], mode: "sequential" });
		let current: FlowQueue = { jobs: [], mode: "sequential" };
		const listeners = new Set<(queue: FlowQueue) => void>();
		const aborts = new Map<string, () => void>();
		const cancellingJobs = new Set<string>();

		const publish = (next: FlowQueue): void => {
			current = next;
			for (const listener of listeners) {
				try {
					listener(cloneQueue(next));
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
				const job = yield* Ref.modify(
					ref,
					(state): readonly [FlowJob, FlowQueue] => {
						const shouldRunNow = !isRunningCapReached(state, maxConcurrent, cancellingJobs);
						const nextJob: FlowJob = {
							id: crypto.randomUUID(),
							profile,
							task,
							...(cwd !== undefined ? { cwd } : {}),
							status: shouldRunNow ? "running" : "pending",
							createdAt: Date.now(),
						};
						return [
							nextJob,
							{
								...state,
								jobs: pruneJobs([...state.jobs, nextJob]),
							},
						];
					},
				);
			const next = yield* Ref.get(ref);
			publish(next);
			return { ...job };
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

		const cancel = (id: string): Effect.Effect<"cancelled" | "already_terminal", JobNotFoundError> =>
			Effect.gen(function* () {
				const outcome = yield* Ref.modify(
					ref,
					(s): readonly [QueueMutation, FlowQueue] => {
						const job = s.jobs.find((j) => j.id === id);
						if (job === undefined) {
							return [{ _tag: "missing" }, s] as const;
						}
						if (job.status === "pending") {
							const cancelledState: FlowQueue = {
								...s,
								jobs: s.jobs.map((j): FlowJob =>
									j.id === id ? { ...j, status: "cancelled", lastProgress: "cancelled" } : j,
								),
							};
							return [
								{ _tag: "updated", next: promotePendingJobs(cancelledState, maxConcurrent, cancellingJobs) },
								promotePendingJobs(cancelledState, maxConcurrent, cancellingJobs),
							] as const;
						}
						if (job.status === "running") {
							cancellingJobs.add(id);
							const next = {
								...s,
								jobs: s.jobs.map((j) =>
									j.id === id ? { ...j, lastProgress: "cancelling" } : j,
								),
							};
							return [{ _tag: "updated", next }, next] as const;
						}
						return [{ _tag: "unchanged" }, s] as const;
					},
				);
			if (outcome._tag === "missing") {
					return yield* Effect.fail(new JobNotFoundError({ id }));
			}
			if (outcome._tag === "updated") {
				runAbort(id);
			publish(outcome.next);
				return "cancelled" as const;
			}
			return "already_terminal" as const;
		});

		const bindAbort = (id: string, abort: () => void): Effect.Effect<FlowJobStatus, JobNotFoundError> =>
			Effect.gen(function* () {
			aborts.set(id, abort);
			const status = yield* Ref.get(ref).pipe(
				Effect.flatMap((state) => {
					const job = state.jobs.find((candidate) => candidate.id === id);
					if (job === undefined) {
						aborts.delete(id); // clean up stale registration
						return Effect.fail(new JobNotFoundError({ id }));
					}
					return Effect.succeed(job.status);
				}),
			);
			if (isTerminalStatus(status)) {
				aborts.delete(id);
				if (status === "cancelled") {
					try {
						abort();
					} catch (error) {
						console.warn("flow queue abort handler error", error);
					}
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
								const nextState = {
									...s,
									jobs: s.jobs.map((entry) =>
										entry.id === id
											? mergeStatusUpdate(entry, status, applyOutputCap(extras) ?? {})
											: entry,
									),
								};
								const nextWithPromotion = finalizeTerminalTransition(
									nextState,
									id,
									maxConcurrent,
									cancellingJobs,
									status,
								);
								return [{ _tag: "updated", next: nextWithPromotion }, nextWithPromotion] as const;
							}
							return [{ _tag: "unchanged" }, s] as const;
						}

						const shouldRunAsRequested = allowPendingToRunningTransition(
							s,
							job,
							maxConcurrent,
							status,
							cancellingJobs,
						);
						const nextStatus: FlowJobStatus = shouldRunAsRequested ? status : "pending";
						const nextState = {
							...s,
							jobs: s.jobs.map((entry) =>
								entry.id === id
									? mergeStatusUpdate(entry, nextStatus, applyOutputCap(extras) ?? {})
									: entry,
							),
						};
						const nextWithPromotion = isTerminalStatus(nextStatus)
							? finalizeTerminalTransition(nextState, id, maxConcurrent, cancellingJobs, nextStatus)
							: nextState;
						return [{ _tag: "updated", next: nextWithPromotion }, nextWithPromotion] as const;
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
					: jobs.map((j) => ({ ...j }));
			const next: FlowQueue = { jobs: normalizedJobs, mode: "sequential" };
			return Effect.gen(function* () {
				yield* Ref.set(ref, next);
				aborts.clear();
				cancellingJobs.clear();
				publish(next);
			});
		};

		return {
			enqueue,
			getAll,
			peek,
			subscribe,
			cancel,
			bindAbort,
			clearAbort,
			setStatus,
			snapshot,
			restoreFrom,
		};
		});
