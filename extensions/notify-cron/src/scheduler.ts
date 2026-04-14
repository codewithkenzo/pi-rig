import type { NotifyCronJob, NotifyCronJobState, NotifyCronLease, NotifyCronRun } from "./types.js";
import { formatDestinationTarget } from "../../../shared/messaging/destination.js";

const DEFAULT_LEASE_MS = 30_000;
const MAX_IDEMPOTENCY_KEYS = 10_000;

export interface NotifyCronTickResult {
	readonly blockedByLease: boolean;
	readonly lease: NotifyCronLease | null;
	readonly runs: readonly NotifyCronRun[];
}

export interface NotifyCronScheduler {
	upsert(job: NotifyCronJob): void;
	remove(jobId: string): boolean;
	list(): readonly NotifyCronJobState[];
	tick(owner: string, now: number): NotifyCronTickResult;
}

const makeIdempotencyKey = (job: NotifyCronJob, scheduledAt: number): string => {
	const destination = formatDestinationTarget(job.destination);
	return `${job.id}:${scheduledAt}:${destination}`;
};

export const makeNotifyCronScheduler = (leaseMs = DEFAULT_LEASE_MS): NotifyCronScheduler => {
	const jobs = new Map<string, NotifyCronJobState>();
	const idempotency = new Set<string>();
	let lease: NotifyCronLease | null = null;

	const ensureLease = (owner: string, now: number): boolean => {
		if (lease === null || lease.expiresAt <= now || lease.owner === owner) {
			lease = { owner, expiresAt: now + leaseMs };
			return true;
		}
		return false;
	};

	const trimIdempotency = (): void => {
		if (idempotency.size <= MAX_IDEMPOTENCY_KEYS) return;
		const next = Array.from(idempotency).slice(idempotency.size - Math.floor(MAX_IDEMPOTENCY_KEYS * 0.8));
		idempotency.clear();
		for (const key of next) idempotency.add(key);
	};

	return {
		upsert(job) {
			const prev = jobs.get(job.id);
			jobs.set(job.id, {
				job,
				lastScheduledAt: prev?.lastScheduledAt,
				lastAttemptAt: prev?.lastAttemptAt,
				lastSuccessAt: prev?.lastSuccessAt,
			});
		},
		remove(jobId) {
			return jobs.delete(jobId);
		},
		list() {
			return Array.from(jobs.values());
		},
		tick(owner, now) {
			if (!ensureLease(owner, now)) {
				return { blockedByLease: true, lease, runs: [] };
			}

			const runs: NotifyCronRun[] = [];
			for (const state of jobs.values()) {
				const { job } = state;
				if (!job.enabled) continue;
				const intervalMs = job.everyMinutes * 60_000;
				const scheduledAt = Math.floor(now / intervalMs) * intervalMs;
				if (state.lastScheduledAt !== undefined && scheduledAt <= state.lastScheduledAt) {
					continue;
				}

				const key = makeIdempotencyKey(job, scheduledAt);
				state.lastScheduledAt = scheduledAt;
				state.lastAttemptAt = now;
				if (idempotency.has(key)) {
					continue;
				}

				idempotency.add(key);
				trimIdempotency();
				state.lastSuccessAt = now;
				runs.push({
					jobId: job.id,
					scheduledAt,
					idempotencyKey: key,
					destination: job.destination,
					message: job.message,
					envelope: job.envelope,
				});
			}

			return { blockedByLease: false, lease, runs };
		},
	};
};
