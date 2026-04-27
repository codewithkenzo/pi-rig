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

export type FlowQueueRailTone = "inactive" | "active" | "warning" | "success" | "error";
export type FlowActivityDisplayTone = FlowActivityRow["tone"];

export interface FlowQueueRailRow {
	ordinal: string;
	idHint: string;
	selected: boolean;
	title: string;
	subtitle: string;
	statusToken: string;
	statusTone: FlowQueueRailTone;
	proofToken: string;
	freshnessLabel: string;
	budgetLabel?: string;
	phaseToken?: string;
}

export interface FlowActivityDisplayRow {
	ts: number;
	timestamp: string;
	marker: string;
	chip: string;
	label: string;
	detail: string;
	tone?: FlowActivityDisplayTone;
}

export interface FlowCoordinatorDetailRow {
	label: string;
	value: string;
	tone?: FlowActivityDisplayTone;
}

export interface FlowCoordinatorDetailSection {
	title: string;
	rows: FlowCoordinatorDetailRow[];
}

export interface FlowCoordinatorDetail {
	title: string;
	selectedId?: string;
	sections: FlowCoordinatorDetailSection[];
}

export interface FlowCoordinatorDetailOptions {
	maxSignals?: number;
	maxOutputChars?: number;
	now?: number;
}

const normalizeCell = (value: string | undefined): string | undefined => {
	if (value === undefined) {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

const queueStatusTone = (status: FlowJob["status"]): FlowQueueRailTone => {
	switch (status) {
		case "running":
			return "active";
		case "pending":
			return "warning";
		case "done":
			return "success";
		case "failed":
			return "error";
		case "cancelled":
			return "inactive";
	}
};

const formatDurationLabel = (ms: number): string => {
	if (ms < 1000) {
		return `${ms}ms`;
	}
	const totalSeconds = Math.round(ms / 1000);
	if (totalSeconds < 60) {
		return `${totalSeconds}s`;
	}
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return seconds === 0 ? `${minutes}m` : `${minutes}m${String(seconds).padStart(2, "0")}s`;
};

const shortIdHint = (id: string): string => {
	const trimmed = id.trim();
	if (trimmed.length <= 8) {
		return trimmed;
	}
	const segments = trimmed.split(/[^A-Za-z0-9]+/).filter((segment) => segment.length > 0);
	const tail = segments.at(-1) ?? trimmed;
	return tail.length <= 8 ? tail : tail.slice(-8);
};

const titleLabel = (job: FlowJob): string => normalizeCell(job.profile) ?? normalizeCell(job.agent) ?? "(job)";

const subtitleLabel = (task: string): string => ellipsize(task.trim().replace(/\s+/g, " "), 72);

const proofToken = (job: FlowJob): string => normalizeCell(job.envelope?.reasoning) ?? normalizeCell(job.agent) ?? normalizeCell(job.profile) ?? "job";

const freshnessLabel = (job: FlowJob, now: number): string => {
	if (job.finishedAt !== undefined) {
		const start = job.startedAt ?? job.createdAt;
		return formatDurationLabel(Math.max(0, job.finishedAt - start));
	}
	if (job.startedAt !== undefined) {
		return formatDurationLabel(Math.max(0, now - job.startedAt));
	}
	return formatDurationLabel(Math.max(0, now - job.createdAt));
};

const budgetLabel = (job: FlowJob): string | undefined => {
	const toolCount = job.toolCount;
	const maxToolCalls = job.envelope?.maxToolCalls;
	if (maxToolCalls !== undefined) {
		return `${toolCount ?? 0}/${maxToolCalls}`;
	}
	if (toolCount !== undefined) {
		return `${toolCount}`;
	}
	const runtimeWarningMs = job.envelope?.runtimeWarningMs;
	if (runtimeWarningMs !== undefined) {
		return `warn ${formatDurationLabel(runtimeWarningMs)}`;
	}
	const maxRuntimeMs = job.envelope?.maxRuntimeMs;
	if (maxRuntimeMs !== undefined) {
		return formatDurationLabel(maxRuntimeMs);
	}
	return undefined;
};

const writingSummaryToken = (job: FlowJob): string | undefined => {
	if (job.writingSummary !== true) {
		return undefined;
	}
	return job.summaryPhaseSource !== undefined ? `writing-summary:${job.summaryPhaseSource}` : "writing-summary";
};

export const selectQueueRailRows = (
	snapshot: FlowQueue,
	selectedId: string | undefined,
	now = Date.now(),
): FlowQueueRailRow[] => {
	const ordinalWidth = Math.max(2, String(snapshot.jobs.length).length);
	return snapshot.jobs.map((job, index) => ({
		ordinal: String(index + 1).padStart(ordinalWidth, "0"),
		idHint: shortIdHint(job.id),
		selected: selectedId === job.id,
		title: titleLabel(job),
		subtitle: subtitleLabel(job.task),
		statusToken: job.status,
		statusTone: queueStatusTone(job.status),
		proofToken: proofToken(job),
		freshnessLabel: freshnessLabel(job, now),
		...((): Pick<FlowQueueRailRow, "budgetLabel" | "phaseToken"> => {
			const budget = budgetLabel(job);
			const phase = writingSummaryToken(job);
			return {
				...(budget !== undefined ? { budgetLabel: budget } : {}),
				...(phase !== undefined ? { phaseToken: phase } : {}),
			};
		})(),
	}));
};

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

const activityTimestamp = (ts: number, startedAt: number | undefined): string => {
	if (startedAt === undefined) {
		return "+?s";
	}
	const seconds = Math.max(0, Math.round((ts - startedAt) / 1000));
	return `+${seconds}s`;
};

const activityMarker = (tone: FlowActivityDisplayTone): string => {
	switch (tone) {
		case "active":
			return ">";
		case "success":
			return "+";
		case "warning":
			return "!";
		case "error":
			return "x";
		case "muted":
			return ".";
		default:
			return "-";
	}
};

const isBudgetWarningRow = (row: FlowActivityRow): boolean =>
	row.kind === "system" && normalizeCell(row.label)?.toLowerCase() === "budget";

const statusChip = (row: FlowActivityRow): string => {
	if (isBudgetWarningRow(row)) {
		return "WARNING";
	}
	switch (row.tone) {
		case "warning":
		case "error":
			return "WARNING";
		case "muted":
		case "default":
		case undefined:
			return "INFO";
		case "active":
		case "success":
			return "STATUS";
	}
	return "INFO";
};

const activityChip = (row: FlowActivityRow): string => {
	switch (row.kind) {
		case "tool_start":
			return "TOOL CALL";
		case "tool_end":
			return "TOOL RESULT";
		case "assistant":
			return "MESSAGE";
		case "summary":
			return "SUMMARY";
		case "progress":
		case "status":
		case "system":
			return statusChip(row);
	}
};

const activityLabel = (row: FlowActivityRow, job: FlowJob | undefined): string => {
	const label = normalizeCell(row.label);
	if (label !== undefined) {
		return label;
	}
	switch (row.kind) {
		case "tool_start":
		case "tool_end":
			return "tool";
		case "assistant":
			return normalizeCell(job?.agent) ?? normalizeCell(job?.profile) ?? "agent";
		case "summary":
			return "summary";
		case "progress":
			return "progress";
		case "status":
			return "status";
		case "system":
			return "system";
	}
};

const normalizeActivityDetail = (text: string): string => text.trim().replace(/\s+/g, " ");

const displayTone = (row: FlowActivityRow): FlowActivityDisplayTone =>
	isBudgetWarningRow(row) ? "warning" : (row.tone ?? "default");

export const selectActivityDisplayRows = (
	rows: readonly FlowActivityRow[],
	job: FlowJob | undefined,
): FlowActivityDisplayRow[] => {
	const displayRows: FlowActivityDisplayRow[] = [];
	if (job?.startedAt !== undefined && job.status !== "pending") {
		const tone: FlowActivityDisplayTone = job.status === "failed"
			? "error"
			: job.status === "done"
				? "success"
				: job.status === "cancelled"
					? "muted"
					: "active";
		displayRows.push({
			ts: job.startedAt,
			timestamp: activityTimestamp(job.startedAt, job.startedAt),
			marker: activityMarker(tone),
			chip: "AGENT STARTED",
			label: normalizeCell(job.agent) ?? normalizeCell(job.profile) ?? "agent",
			detail: normalizeActivityDetail(job.task),
			tone,
		});
	}
	for (const row of rows) {
		const tone = displayTone(row);
		displayRows.push({
			ts: row.ts,
			timestamp: activityTimestamp(row.ts, job?.startedAt),
			marker: activityMarker(tone),
			chip: activityChip(row),
			label: activityLabel(row, job),
			detail: normalizeActivityDetail(row.text),
			tone,
		});
	}
	return displayRows;
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

const appendDetailRow = (
	rows: FlowCoordinatorDetailRow[],
	label: string,
	value: string | number | undefined,
	tone?: FlowActivityDisplayTone,
): void => {
	const normalized = normalizeCell(value === undefined ? undefined : String(value));
	if (normalized === undefined) {
		return;
	}
	rows.push({
		label,
		value: normalized,
		...(tone !== undefined ? { tone } : {}),
	});
};

const formatTimestampValue = (ms: number | undefined): string | undefined => {
	if (ms === undefined || !Number.isFinite(ms)) {
		return undefined;
	}
	return new Date(ms).toISOString();
};

const formatRuntimeValue = (job: FlowJob, now: number): string | undefined => {
	const start = job.startedAt;
	const end = job.finishedAt ?? (job.status === "running" ? now : undefined);
	if (start === undefined || end === undefined) {
		return undefined;
	}
	return formatDurationLabel(Math.max(0, end - start));
};

const modelDetailValue = (job: FlowJob): string | undefined => {
	const model = normalizeCell(job.envelope?.model) ?? normalizeCell(job.model);
	const provider = normalizeCell(job.envelope?.provider);
	if (model === undefined) {
		return undefined;
	}
	return provider !== undefined ? `${model}@${provider}` : model;
};

const budgetRows = (job: FlowJob): FlowCoordinatorDetailRow[] => {
	const rows: FlowCoordinatorDetailRow[] = [];
	const envelope = job.envelope;
	if (job.toolCount !== undefined || envelope?.maxToolCalls !== undefined) {
		appendDetailRow(rows, "tools", `${job.toolCount ?? 0}${envelope?.maxToolCalls !== undefined ? `/${envelope.maxToolCalls}` : ""}`);
	}
	if (envelope?.requestedMaxIterations !== undefined) {
		appendDetailRow(rows, "requested iters", envelope.requestedMaxIterations);
	}
	if (envelope?.maxIterations !== undefined) {
		appendDetailRow(rows, "max iters", envelope.maxIterations);
	}
	if (envelope?.runtimeWarningMs !== undefined) {
		appendDetailRow(rows, "runtime warn", formatDurationLabel(envelope.runtimeWarningMs));
	}
	if (envelope?.maxRuntimeMs !== undefined) {
		appendDetailRow(rows, "max runtime", formatDurationLabel(envelope.maxRuntimeMs));
	}
	if (job.status === "done" || job.status === "failed" || job.status === "cancelled") {
		appendDetailRow(rows, "terminal", job.status, job.status === "done" ? "success" : job.status === "failed" ? "error" : "muted");
	} else {
		appendDetailRow(rows, "status", job.status, job.status === "running" ? "active" : "muted");
	}
	return rows;
};

const summarySource = (job: FlowJob): string => {
	if (job.status === "failed") {
		return job.error !== undefined ? "error" : job.lastAssistantText !== undefined ? "assistant" : job.lastProgress !== undefined ? "progress" : "task";
	}
	if (job.status === "done") {
		return job.output !== undefined ? "output" : job.lastAssistantText !== undefined ? "assistant" : job.lastProgress !== undefined ? "progress" : "task";
	}
	if (job.status === "cancelled") {
		return job.error !== undefined ? "error" : job.lastProgress !== undefined ? "progress" : "status";
	}
	return job.lastAssistantText !== undefined
		? "assistant"
		: job.output !== undefined
			? "output"
			: job.error !== undefined
				? "error"
				: job.lastProgress !== undefined
					? "progress"
					: "task";
};

const capDetailText = (text: string, maxChars: number): string => {
	const normalized = text.trim();
	return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}…` : normalized;
};

export const selectCoordinatorDetail = (
	job: FlowJob | undefined,
	rows: readonly FlowActivityRow[] = [],
	options: FlowCoordinatorDetailOptions = {},
): FlowCoordinatorDetail => {
	const title = "DETAIL / SELECTED FLOW";
	if (job === undefined) {
		return {
			title,
			sections: [
				{
					title: "CURRENT STATE",
					rows: [{ label: "state", value: "No selected flow job." }],
				},
			],
		};
	}

	const now = options.now ?? Date.now();
	const maxSignals = options.maxSignals ?? 5;
	const maxOutputChars = options.maxOutputChars ?? 2_000;
	const sections: FlowCoordinatorDetailSection[] = [];

	const currentRows: FlowCoordinatorDetailRow[] = [];
	appendDetailRow(currentRows, "status", job.status, job.status === "running" ? "active" : job.status === "done" ? "success" : job.status === "failed" ? "error" : "muted");
	appendDetailRow(currentRows, "profile", job.profile);
	appendDetailRow(currentRows, "agent", job.agent);
	appendDetailRow(currentRows, "task", job.task);
	appendDetailRow(currentRows, "model", modelDetailValue(job));
	appendDetailRow(currentRows, "reasoning", job.envelope?.reasoning);
	appendDetailRow(currentRows, "effort", job.envelope?.effort);
	appendDetailRow(currentRows, "tool count", job.toolCount);
	appendDetailRow(currentRows, "created", formatTimestampValue(job.createdAt));
	appendDetailRow(currentRows, "started", formatTimestampValue(job.startedAt));
	appendDetailRow(currentRows, "finished", formatTimestampValue(job.finishedAt));
	appendDetailRow(currentRows, "runtime", formatRuntimeValue(job, now));
	if (job.writingSummary === true) {
		appendDetailRow(currentRows, "phase", job.summaryPhaseSource !== undefined ? `writing-summary:${job.summaryPhaseSource}` : "writing-summary", "warning");
	}
	sections.push({ title: "CURRENT STATE", rows: currentRows });

	const signalRows: FlowCoordinatorDetailRow[] = [];
	for (const row of rows.slice(-maxSignals)) {
		const tone = displayTone(row);
		const label = activityLabel(row, job);
		const detail = normalizeActivityDetail(row.text);
		appendDetailRow(
			signalRows,
			activityChip(row),
			`${activityTimestamp(row.ts, job.startedAt)} ${activityMarker(tone)} ${label}: ${detail}`,
			tone,
		);
	}
	appendDetailRow(signalRows, "last progress", job.lastProgress, "active");
	appendDetailRow(signalRows, "assistant", job.lastAssistantText);
	if (job.recentTools !== undefined && job.recentTools.length > 0) {
		appendDetailRow(signalRows, "recent tools", job.recentTools.join(", "));
	}
	if (signalRows.length > 0) {
		sections.push({ title: "RECENT SIGNALS / NOTES", rows: signalRows });
	}

	const outputRows: FlowCoordinatorDetailRow[] = [];
	appendDetailRow(outputRows, "source", summarySource(job));
	appendDetailRow(outputRows, "text", capDetailText(selectSummaryText(job), maxOutputChars));
	sections.push({ title: "OUTPUT / SUMMARY", rows: outputRows });

	const verificationRows = budgetRows(job);
	if (verificationRows.length > 0) {
		sections.push({ title: "BUDGET / VERIFICATION", rows: verificationRows });
	}

	return {
		title,
		selectedId: job.id,
		sections,
	};
};
