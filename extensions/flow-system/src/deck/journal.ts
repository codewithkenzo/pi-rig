import type { FlowProgressEvent } from "../executor.js";
import type { ProgressUpdate } from "../progress.js";
import type { FlowJob, FlowQueue } from "../types.js";
import { sanitizeFlowText } from "../sanitize.js";

export type FlowActivityTone = "default" | "muted" | "active" | "success" | "warning" | "error";

export interface FlowActivityRow {
	ts: number;
	kind: "progress" | "assistant" | "tool_start" | "tool_end" | "status" | "summary" | "system";
	text: string;
	label?: string;
	tone?: FlowActivityTone;
}

export interface FlowActivityJournalService {
	append(jobId: string, row: Omit<FlowActivityRow, "ts"> & { ts?: number }): void;
	recordProgressEvent(jobId: string, event: FlowProgressEvent, update?: ProgressUpdate): void;
	syncQueue(queue: FlowQueue): void;
	rows(jobId: string | undefined): FlowActivityRow[];
	reset(): void;
	subscribe(listener: () => void): () => void;
}

const DEFAULT_ROW_CAP = 64;
const CONTROL_RE = /[\x00-\x08\x0b-\x1f]/g;

const sanitizeText = (value: string | undefined): string | undefined => {
	if (value === undefined) {
		return undefined;
	}
	const normalized = sanitizeFlowText(value).replace(CONTROL_RE, "").trim();
	return normalized.length > 0 ? normalized : undefined;
};

const sameRow = (left: FlowActivityRow | undefined, right: Omit<FlowActivityRow, "ts">): boolean =>
	left?.kind === right.kind &&
	left?.label === right.label &&
	left?.text === right.text &&
	left?.tone === right.tone;

const statusTone = (job: FlowJob): FlowActivityTone => {
	switch (job.status) {
		case "pending":
			return "muted";
		case "running":
			return job.writingSummary === true ? "warning" : "active";
		case "done":
			return "success";
		case "failed":
			return "error";
		case "cancelled":
			return "muted";
	}
};

const statusText = (job: FlowJob): string => {
	if (job.status === "running" && job.writingSummary === true) {
		return "Writing summary…";
	}
	if (job.status === "failed") {
		return sanitizeText(job.error) ?? "Failed";
	}
	if (job.status === "cancelled") {
		return sanitizeText(job.error) ?? "Cancelled";
	}
	if (job.status === "done") {
		return sanitizeText(job.output) ?? "Done";
	}
	return job.status;
};

const statusKey = (job: FlowJob): string =>
	job.status === "running" && job.writingSummary === true
		? `${job.status}:summary:${job.summaryPhaseSource ?? "unknown"}`
		: job.status;

const progressRow = (
	event: FlowProgressEvent,
	update?: ProgressUpdate,
): Omit<FlowActivityRow, "ts"> | undefined => {
	switch (event._tag) {
		case "tool_start": {
			const text = sanitizeText(update?.extras.lastProgress) ?? sanitizeText(event.detail) ?? "started";
			return { kind: "tool_start", label: event.toolName, text, tone: "active" };
		}
		case "tool_end": {
			const text = sanitizeText(update?.extras.lastProgress) ?? sanitizeText(event.detail) ?? "done";
			return { kind: "tool_end", label: event.toolName, text, tone: "success" };
		}
		case "assistant_text": {
			const text = sanitizeText(update?.extras.lastAssistantText ?? update?.summary);
			return text !== undefined ? { kind: "assistant", text, tone: "default" } : undefined;
		}
		case "summary_state":
			return event.active && update?.extras.writingSummary === true
				? { kind: "summary", text: "Writing summary…", tone: "warning" }
				: undefined;
	}
};

export const makeFlowActivityJournal = (rowCap = DEFAULT_ROW_CAP): FlowActivityJournalService => {
	const entries = new Map<string, FlowActivityRow[]>();
	const lastStatus = new Map<string, string>();
	const listeners = new Set<() => void>();

	const emit = (): void => {
		for (const listener of listeners) {
			try {
				listener();
			} catch (error) {
				console.warn("[flow-system] activity journal listener error", error);
			}
		}
	};

	const append = (jobId: string, row: Omit<FlowActivityRow, "ts"> & { ts?: number }): void => {
		const text = sanitizeText(row.text);
		if (text === undefined) {
			return;
		}
		const label = sanitizeText(row.label);
		const nextRow: Omit<FlowActivityRow, "ts"> = {
			kind: row.kind,
			text,
			...(label !== undefined ? { label } : {}),
			...(row.tone !== undefined ? { tone: row.tone } : {}),
		};
		const current = entries.get(jobId) ?? [];
		if (sameRow(current.at(-1), nextRow)) {
			return;
		}
		entries.set(jobId, [...current, { ...nextRow, ts: row.ts ?? Date.now() }].slice(-rowCap));
		emit();
	};

	return {
		append,
		recordProgressEvent: (jobId: string, event: FlowProgressEvent, update?: ProgressUpdate): void => {
			const row = progressRow(event, update);
			if (row !== undefined) {
				append(jobId, row);
			}
		},
		syncQueue: (queue: FlowQueue): void => {
			const liveIds = new Set(queue.jobs.map((job) => job.id));
			for (const [jobId] of entries) {
				if (!liveIds.has(jobId)) {
					entries.delete(jobId);
				}
			}
			for (const [jobId] of lastStatus) {
				if (!liveIds.has(jobId)) {
					lastStatus.delete(jobId);
				}
			}
			for (const job of queue.jobs) {
				const nextStatusKey = statusKey(job);
				const previous = lastStatus.get(job.id);
				if (previous === nextStatusKey) {
					continue;
				}
				lastStatus.set(job.id, nextStatusKey);
				append(job.id, {
					kind: "status",
					label: job.status,
					text: statusText(job),
					tone: statusTone(job),
				});
			}
		},
		rows: (jobId: string | undefined): FlowActivityRow[] => {
			if (jobId === undefined) {
				return [];
			}
			return (entries.get(jobId) ?? []).map((row) => ({ ...row }));
		},
		reset: (): void => {
			entries.clear();
			lastStatus.clear();
			emit();
		},
		subscribe: (listener: () => void): (() => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
};
