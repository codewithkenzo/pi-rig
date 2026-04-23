import type { FlowQueueService } from "./queue.js";
import type { FlowJobStatus, FlowQueue } from "./types.js";

type Unsub = (() => void) | undefined;

const isTerminalStatus = (status: FlowJobStatus): boolean =>
	status === "done" || status === "failed" || status === "cancelled";

const isTerminalOrRunning = (status: FlowJobStatus): boolean => status !== "pending";

const readFromQueue = (queue: FlowQueueService, jobId: string): FlowJobStatus | "missing" => {
	const jobs = queue.peek().jobs;
	const job = jobs.find((candidate) => candidate.id === jobId);
	if (job === undefined) {
		return "missing";
	}
	return job.status;
};

export const waitForRunSlot = async (
	queue: FlowQueueService,
	jobId: string,
	signal: AbortSignal | undefined,
): Promise<FlowJobStatus> => {
	return await new Promise((resolve, reject) => {
		if (signal?.aborted) {
			resolve("cancelled");
			return;
		}

		let unsubscribe: Unsub;
		let done = false;
		const cleanup = (): void => {
			if (done) {
				return;
			}
			done = true;
			if (unsubscribe !== undefined) {
				unsubscribe();
			}
			if (signal !== undefined) {
				signal.removeEventListener("abort", onAbort);
			}
		};
		const resolveState = (status: FlowJobStatus): void => {
			if (done) {
				return;
			}
			cleanup();
			resolve(status);
		};
		const rejectIfMissing = (): void => {
			if (done) {
				return;
			}
			cleanup();
			reject(new Error(`flow job ${jobId} missing while awaiting slot`));
		};
		const check = (nextState: FlowQueue): void => {
			const status = (() => {
				const jobs = nextState.jobs;
				const job = jobs.find((candidate) => candidate.id === jobId);
				if (job === undefined) {
					return "missing" as const;
				}
				return job.status;
			})();

			if (status === "missing") {
				rejectIfMissing();
				return;
			}
			if (isTerminalOrRunning(status)) {
				if (isTerminalStatus(status)) {
					resolveState(status);
					return;
				}
				resolveState(status);
			}
		};

		const initial = readFromQueue(queue, jobId);
		if (initial === "missing") {
			reject(new Error(`flow job ${jobId} missing while awaiting slot`));
			return;
		}
		if (isTerminalOrRunning(initial)) {
			resolve(initial);
			return;
		}
		const onAbort = (): void => resolveState("cancelled");
		signal?.addEventListener("abort", onAbort, { once: true });
		unsubscribe = queue.subscribe(check);
	});
};

export const waitForTerminalState = async (
	queue: FlowQueueService,
	jobId: string,
	signal: AbortSignal | undefined,
	timeoutMs?: number,
): Promise<FlowJobStatus | "timeout"> => {
	return await new Promise((resolve, reject) => {
		if (signal?.aborted) {
			resolve("cancelled");
			return;
		}

		let unsubscribe: Unsub;
		let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
		let done = false;
		const cleanup = (): void => {
			if (done) {
				return;
			}
			done = true;
			if (unsubscribe !== undefined) {
				unsubscribe();
			}
			if (timeoutHandle !== undefined) {
				clearTimeout(timeoutHandle);
				timeoutHandle = undefined;
			}
			if (signal !== undefined) {
				signal.removeEventListener("abort", onAbort);
			}
		};
		const resolveState = (status: FlowJobStatus | "timeout"): void => {
			if (done) {
				return;
			}
			cleanup();
			resolve(status);
		};
		const rejectIfMissing = (): void => {
			if (done) {
				return;
			}
			cleanup();
			reject(new Error(`flow job ${jobId} missing while awaiting terminal state`));
		};
		const check = (nextState: FlowQueue): void => {
			const status = (() => {
				const jobs = nextState.jobs;
				const job = jobs.find((candidate) => candidate.id === jobId);
				if (job === undefined) {
					return "missing" as const;
				}
				return job.status;
			})();

			if (status === "missing") {
				rejectIfMissing();
				return;
			}
			if (isTerminalStatus(status)) {
				resolveState(status);
			}
		};

		const initial = readFromQueue(queue, jobId);
		if (initial === "missing") {
			reject(new Error(`flow job ${jobId} missing while awaiting terminal state`));
			return;
		}
		if (isTerminalStatus(initial)) {
			resolve(initial);
			return;
		}
		const onAbort = (): void => resolveState("cancelled");
		signal?.addEventListener("abort", onAbort, { once: true });
		if (timeoutMs !== undefined && Number.isFinite(timeoutMs) && timeoutMs >= 1) {
			timeoutHandle = setTimeout(() => resolveState("timeout"), timeoutMs);
		}
		unsubscribe = queue.subscribe(check);
	});
};
