import type { FlowProgressEvent } from "./executor.js";

export const ASSISTANT_TEXT_MAX_CHARS = 160;
export const PROGRESS_TEXT_MAX_CHARS = 96;
export const ASSISTANT_TEXT_THROTTLE_MS = 250;
export const SUMMARY_HEURISTIC_IDLE_MS = 900;
export const SUMMARY_HEURISTIC_MIN_CHARS = 120;
const SUMMARY_COMPLETION_HINT_RE =
	/\b(final (summary|answer)|in summary|to summarize|conclusion|wrapp?(?:ing)?\s+up|summary:)\b/i;
const SUMMARY_NOT_FINAL_RE =
	/\b(still|need to|one more|remaining|before i can|i need to|have to|will run|going to run|next i will|next i['’]?ll|then i['’]?ll|then i will|follow[- ]up)\b/i;

interface ProgressTrackerOptions {
	now?: () => number;
	assistantTextMaxChars?: number;
	progressTextMaxChars?: number;
	assistantTextThrottleMs?: number;
	summaryHeuristicIdleMs?: number;
	summaryHeuristicMinChars?: number;
}

export type SummaryPhaseSource = "explicit" | "heuristic";

export interface ProgressUpdate {
	summary: string;
	extras: {
		toolCount: number;
		recentTools?: string[];
		lastProgress: string;
		lastAssistantText?: string;
		writingSummary?: boolean;
		summaryPhaseSource?: SummaryPhaseSource;
	};
}

export interface FlowProgressTracker {
	readonly toolCount: number;
	readonly completedToolCount: number;
	readonly recentTools: string[];
	apply(event: FlowProgressEvent): ProgressUpdate | undefined;
	/** Flush any pending (throttled) assistant text that was never emitted. Returns undefined if nothing was pending. */
	flush(): ProgressUpdate | undefined;
}

const clipText = (text: string, maxChars: number): string => {
	const normalized = text.trim();
	if (normalized.length === 0) {
		return "";
	}
	const chars = Array.from(normalized);
	if (chars.length <= maxChars) {
		return normalized;
	}
	return `${chars.slice(0, maxChars).join("")}…`;
};

export const createFlowProgressTracker = (options?: ProgressTrackerOptions): FlowProgressTracker => {
	const now = options?.now ?? Date.now;
	const assistantTextMaxChars = options?.assistantTextMaxChars ?? ASSISTANT_TEXT_MAX_CHARS;
	const progressTextMaxChars = options?.progressTextMaxChars ?? PROGRESS_TEXT_MAX_CHARS;
	const assistantTextThrottleMs = options?.assistantTextThrottleMs ?? ASSISTANT_TEXT_THROTTLE_MS;
	const summaryHeuristicIdleMs = options?.summaryHeuristicIdleMs ?? SUMMARY_HEURISTIC_IDLE_MS;
	const summaryHeuristicMinChars = options?.summaryHeuristicMinChars ?? SUMMARY_HEURISTIC_MIN_CHARS;

	let toolCount = 0;
	let completedToolCount = 0;
	let recentTools: string[] = [];
	let lastToolActivityAt: number | undefined;
	let writingSummary = false;
	let summaryPhaseSource: SummaryPhaseSource | undefined;
	let lastAssistantPublishedText: string | undefined;
	let lastAssistantEmitAt: number | undefined;
	let pendingAssistantText: string | undefined;
	const pushRecentTool = (label: string): void => {
		recentTools = [...recentTools, label].slice(-6);
	};

	const summaryPhaseExtras = (): Pick<ProgressUpdate["extras"], "writingSummary" | "summaryPhaseSource"> => ({
		writingSummary,
		...(summaryPhaseSource !== undefined ? { summaryPhaseSource } : {}),
	});

	const clearSummaryPhase = (): void => {
		writingSummary = false;
		summaryPhaseSource = undefined;
	};

	const fromProgress = (detail: string): ProgressUpdate | undefined => {
		const clipped = clipText(detail, progressTextMaxChars);
		if (clipped.length === 0) {
			return undefined;
		}
		return {
			summary: clipped,
			extras: {
				toolCount,
				...(recentTools.length > 0 ? { recentTools } : {}),
				lastProgress: clipped,
				...summaryPhaseExtras(),
			},
		};
	};

	const fromAssistant = (detail: string, forceEmit = false): ProgressUpdate | undefined => {
		const clipped = clipText(detail, assistantTextMaxChars);
		if (clipped.length === 0) {
			return undefined;
		}
		pendingAssistantText = clipped;
		const at = now();
		if (!forceEmit && lastAssistantEmitAt !== undefined && at - lastAssistantEmitAt < assistantTextThrottleMs) {
			return undefined;
		}
		const toPublish = pendingAssistantText;
		pendingAssistantText = undefined;
		if (toPublish === undefined || toPublish === lastAssistantPublishedText) {
			return undefined;
		}
		lastAssistantEmitAt = at;
		lastAssistantPublishedText = toPublish;
		return {
			summary: toPublish,
			extras: {
				toolCount,
				...(recentTools.length > 0 ? { recentTools } : {}),
				lastProgress: toPublish,
				lastAssistantText: toPublish,
				...summaryPhaseExtras(),
			},
		};
	};

	return {
		get toolCount() {
			return toolCount;
		},
		get completedToolCount() {
			return completedToolCount;
		},
		get recentTools() {
			return recentTools;
		},
		apply(event) {
			if (event._tag === "summary_state") {
				const nextWritingSummary = event.active;
				const nextSource = event.active ? event.source : undefined;
				if (nextWritingSummary === writingSummary && nextSource === summaryPhaseSource) {
					return undefined;
				}
				writingSummary = nextWritingSummary;
				summaryPhaseSource = nextSource;
				return fromProgress(event.active ? "writing summary…" : "summary phase cleared");
			}

			if (event._tag === "tool_start") {
				lastToolActivityAt = now();
				if (summaryPhaseSource !== "explicit") {
					clearSummaryPhase();
				}
				toolCount += 1;
				pushRecentTool(`${event.toolName}…`);
				return fromProgress(event.detail);
			}
			if (event._tag === "tool_end") {
				lastToolActivityAt = now();
				if (summaryPhaseSource !== "explicit") {
					clearSummaryPhase();
				}
				completedToolCount += 1;
				pushRecentTool(`${event.toolName} done`);
				return fromProgress(event.detail);
			}

			let shouldForceEmit = false;
			if (!writingSummary && summaryPhaseSource !== "explicit") {
				const settledTools =
					toolCount > 0 &&
					completedToolCount >= toolCount &&
					lastToolActivityAt !== undefined &&
					now() - lastToolActivityAt >= summaryHeuristicIdleMs;
				if (
					settledTools &&
					event.detail.trim().length >= summaryHeuristicMinChars &&
					!SUMMARY_NOT_FINAL_RE.test(event.detail) &&
					SUMMARY_COMPLETION_HINT_RE.test(event.detail)
				) {
					writingSummary = true;
					summaryPhaseSource = "heuristic";
					shouldForceEmit = true;
				}
			}
			return fromAssistant(event.detail, shouldForceEmit);
		},
		flush() {
			if (pendingAssistantText === undefined || pendingAssistantText === lastAssistantPublishedText) {
				return undefined;
			}
			const toPublish = pendingAssistantText;
			lastAssistantPublishedText = toPublish;
			pendingAssistantText = undefined;
			return {
				summary: toPublish,
				extras: {
					toolCount,
					...(recentTools.length > 0 ? { recentTools } : {}),
					lastProgress: toPublish,
					lastAssistantText: toPublish,
					...summaryPhaseExtras(),
				},
			};
		},
	};
};
