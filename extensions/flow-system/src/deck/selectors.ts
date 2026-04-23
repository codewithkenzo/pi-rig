import type { FlowJob, FlowQueue } from "../types.js";
import type { FlowActivityJournalService, FlowActivityRow } from "./journal.js";

export interface DeckCountSummary {
	total: number;
	running: number;
	pending: number;
	done: number;
	failed: number;
	cancelled: number;
	writingSummary: number;
}

export const selectQueueCounts = (snapshot: FlowQueue): DeckCountSummary => ({
	total: snapshot.jobs.length,
	running: snapshot.jobs.filter((job) => job.status === "running").length,
	pending: snapshot.jobs.filter((job) => job.status === "pending").length,
	done: snapshot.jobs.filter((job) => job.status === "done").length,
	failed: snapshot.jobs.filter((job) => job.status === "failed").length,
	cancelled: snapshot.jobs.filter((job) => job.status === "cancelled").length,
	writingSummary: snapshot.jobs.filter((job) => job.status === "running" && job.writingSummary === true).length,
});

export const selectJobById = (
	snapshot: FlowQueue,
	selectedId: string | undefined,
): FlowJob | undefined => snapshot.jobs.find((job) => job.id === selectedId);

const fallbackStreamRows = (job: FlowJob | undefined): FlowActivityRow[] => {
	if (job === undefined) {
		return [];
	}
	const rows: FlowActivityRow[] = [];
	const ts = job.startedAt ?? job.createdAt;
	if (job.lastProgress !== undefined) {
		rows.push({ ts, kind: "progress", text: job.lastProgress, tone: "active" });
	}
	if (job.lastAssistantText !== undefined) {
		rows.push({ ts, kind: "assistant", text: job.lastAssistantText, tone: "default" });
	}
	return rows;
};

export const selectStreamRows = (
	journal: FlowActivityJournalService,
	job: FlowJob | undefined,
): FlowActivityRow[] => {
	const rows = journal.rows(job?.id);
	return rows.length > 0 ? rows : fallbackStreamRows(job);
};

export const selectVisibleStreamRows = (
	rows: readonly FlowActivityRow[],
	maxRows: number,
	scrollOffset: number,
	followMode: boolean,
): FlowActivityRow[] => {
	if (rows.length <= maxRows) {
		return rows.map((row) => ({ ...row }));
	}
	if (followMode) {
		return rows.slice(-maxRows).map((row) => ({ ...row }));
	}
	const maxStart = Math.max(0, rows.length - maxRows);
	const start = Math.min(Math.max(0, scrollOffset), maxStart);
	return rows.slice(start, start + maxRows).map((row) => ({ ...row }));
};

export const selectSummaryText = (job: FlowJob | undefined): string => {
	if (job === undefined) {
		return "";
	}
	if (job.status === "failed") {
		return job.error ?? job.lastAssistantText ?? job.lastProgress ?? job.task;
	}
	if (job.status === "done") {
		return job.output ?? job.lastAssistantText ?? job.lastProgress ?? job.task;
	}
	if (job.status === "cancelled") {
		return job.error ?? job.lastProgress ?? "cancelled";
	}
	return job.lastAssistantText ?? job.output ?? job.error ?? job.lastProgress ?? job.task;
};

export const selectSummaryPreview = (job: FlowJob | undefined, maxChars = 120): string | undefined => {
	const value = selectSummaryText(job).trim();
	if (value.length === 0) {
		return undefined;
	}
	return value.length > maxChars ? `${value.slice(0, maxChars)}…` : value;
};
