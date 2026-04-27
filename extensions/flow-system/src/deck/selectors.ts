import { ellipsize } from "../../../../shared/ui/hud.js";
import type { FlowJob, FlowQueue } from "../types.js";
import type { FlowActivityJournalService, FlowActivityRow } from "./journal.js";

export type FlowStatusMode = "idle" | "flow" | "team";
export type FlowStatusPhase = "queued" | "running" | "summary" | "blocked" | "done" | "failed" | "cancelled";
export type FlowStatusTone = "inactive" | "active" | "warning" | "success" | "error";
export type FlowStatusBudgetState = "none" | "tracked" | "warning" | "capped";

export interface FlowStatusCounts {
	total: number;
	active: number;
	running: number;
	pending: number;
	done: number;
	failed: number;
	cancelled: number;
	writingSummary: number;
}

export interface FlowStatusSelectorState {
	mode: FlowStatusMode;
	label: string;
	phase: FlowStatusPhase;
	tone: FlowStatusTone;
	counts: FlowStatusCounts;
	primaryJob?: FlowJob;
	budgetState: FlowStatusBudgetState;
	checkpointState: "none" | "summary" | "blocked";
	activity: string;
}

export interface FlowStatusLineFormatOptions {
	maxChars?: number;
	maxLabelChars?: number;
	maxActivityChars?: number;
	maxModelChars?: number;
}

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

const activeJobs = (snapshot: FlowQueue): FlowJob[] =>
	snapshot.jobs.filter((job) => job.status === "running" || job.status === "pending");

const statusPhase = (job: FlowJob | undefined): FlowStatusPhase => {
	if (job === undefined) {
		return "done";
	}
	if (job.status === "running" && job.writingSummary === true) {
		return "summary";
	}
	if (job.status === "pending") {
		return "queued";
	}
	if (job.status === "running") {
		return "running";
	}
	return job.status;
};

const statusTone = (phase: FlowStatusPhase): FlowStatusTone => {
	switch (phase) {
		case "queued":
			return "warning";
		case "running":
		case "summary":
			return "active";
		case "done":
			return "success";
		case "failed":
		case "blocked":
			return "error";
		case "cancelled":
			return "inactive";
	}
};

const budgetState = (job: FlowJob | undefined): FlowStatusBudgetState => {
	if (job?.envelope === undefined) {
		return "none";
	}
	const maxToolCalls = job.envelope.maxToolCalls;
	const toolCount = job.toolCount ?? 0;
	if (maxToolCalls !== undefined && toolCount >= maxToolCalls) {
		return "capped";
	}
	if (maxToolCalls !== undefined && toolCount >= Math.max(1, Math.floor(maxToolCalls * 0.8))) {
		return "warning";
	}
	return job.envelope.maxToolCalls !== undefined ||
		job.envelope.maxRuntimeMs !== undefined ||
		job.envelope.runtimeWarningMs !== undefined
		? "tracked"
		: "none";
};

const statusIcon = (phase: FlowStatusPhase): string => {
	switch (phase) {
		case "queued":
			return "○";
		case "running":
		case "summary":
			return "▶";
		case "done":
			return "✓";
		case "failed":
			return "✗";
		case "blocked":
			return "!";
		case "cancelled":
			return "⊘";
	}
};

const modelStatusValue = (job: FlowJob): string => {
	const model = job.envelope?.model ?? job.model;
	const provider = job.envelope?.provider;
	if (model === undefined || model.trim().length === 0) {
		return "(default)";
	}
	const normalizedModel = model.trim();
	const normalizedProvider = provider?.trim();
	return normalizedProvider !== undefined && normalizedProvider.length > 0 ? `${normalizedModel}@${normalizedProvider}` : normalizedModel;
};

const reasoningStatusValue = (job: FlowJob): string => job.envelope?.reasoning ?? "(profile)";

const effortStatusValue = (job: FlowJob): string => job.envelope?.effort ?? "auto";

const joinStatusPieces = (pieces: ReadonlyArray<string | undefined>): string =>
	pieces.filter((piece): piece is string => typeof piece === "string" && piece.length > 0).join(" · ");

const formatStatusMeta = (status: FlowStatusSelectorState): string[] => {
	const primary = status.primaryJob;
	if (primary === undefined) {
		return [];
	}
	return [
		`m:${ellipsize(modelStatusValue(primary), 20)}`,
		`r:${reasoningStatusValue(primary)}`,
		`e:${effortStatusValue(primary)}`,
	];
};

const formatCheckpointState = (checkpointState: FlowStatusSelectorState["checkpointState"]): string | undefined => {
	switch (checkpointState) {
		case "summary":
			return "writing-summary";
		case "blocked":
			return "blocked";
		case "none":
			return undefined;
	}
};

const formatBudgetState = (budgetStateValue: FlowStatusBudgetState): string | undefined =>
	budgetStateValue === "none" ? undefined : `budget:${budgetStateValue}`;

export const selectCompactFlowStatusLine = (
	status: FlowStatusSelectorState,
	options: FlowStatusLineFormatOptions = {},
): string | undefined => {
	if (status.mode === "idle" || status.primaryJob === undefined) {
		return undefined;
	}

	const maxChars = options.maxChars ?? 120;
	let maxLabelChars = options.maxLabelChars ?? 24;
	let maxActivityChars = options.maxActivityChars ?? 40;
	const maxModelChars = options.maxModelChars ?? 20;
	const labelBase = status.label.trim().length > 0 ? status.label.trim() : "flow";
	const extra = status.counts.active > 1 ? ` +${status.counts.active - 1}` : "";
	let label = ellipsize(labelBase, maxLabelChars);
	let activity = ellipsize(status.activity, maxActivityChars);
	const checkpoint = formatCheckpointState(status.checkpointState);
	const budget = formatBudgetState(status.budgetState);
	let meta = formatStatusMeta(status).map((piece, index) =>
		index === 0 ? `m:${ellipsize(piece.slice(2), maxModelChars)}` : piece,
	);

	const render = (): string => {
		const prefix = `${statusIcon(status.phase)} ${label}${extra}`;
		return joinStatusPieces([
			prefix,
			activity,
			checkpoint,
			budget,
			...meta,
		]);
	};

	let line = render();
	while (line.length > maxChars && meta.length > 0) {
		meta = meta.slice(0, -1);
		line = render();
	}
	while (line.length > maxChars && maxActivityChars > 8) {
		maxActivityChars = Math.max(8, maxActivityChars - 4);
		activity = ellipsize(status.activity, maxActivityChars);
		line = render();
	}
	while (line.length > maxChars && maxLabelChars > 8) {
		maxLabelChars = Math.max(8, maxLabelChars - 2);
		label = ellipsize(labelBase, maxLabelChars);
		line = render();
	}

	return line.length > maxChars ? ellipsize(line, maxChars) : line;
};

export const selectFlowStatusState = (snapshot: FlowQueue): FlowStatusSelectorState => {
	const counts = selectQueueCounts(snapshot);
	const active = activeJobs(snapshot);
	const primary = active.find((job) => job.status === "running") ?? active[0];
	if (primary === undefined) {
		const lastFailed = snapshot.jobs.find((job) => job.status === "failed");
		const lastDone = snapshot.jobs.find((job) => job.status === "done") ?? snapshot.jobs.find((job) => job.status === "cancelled");
		const finalJob = lastFailed ?? lastDone;
		const phase = statusPhase(finalJob);
		return {
			mode: "idle",
			label: "flow",
			phase,
			tone: statusTone(phase),
			counts: { ...counts, active: 0 },
			...(finalJob !== undefined ? { primaryJob: finalJob } : {}),
			budgetState: budgetState(finalJob),
			checkpointState: "none",
			activity: finalJob?.lastProgress ?? finalJob?.task ?? "idle",
		};
	}
	const phase = statusPhase(primary);
	return {
		mode: "flow",
		label: primary.profile,
		phase,
		tone: statusTone(phase),
		counts: { ...counts, active: active.length },
		primaryJob: primary,
		budgetState: budgetState(primary),
		checkpointState: counts.writingSummary > 0 ? "summary" : "none",
		activity: primary.lastProgress ?? primary.lastAssistantText ?? primary.task,
	};
};

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
