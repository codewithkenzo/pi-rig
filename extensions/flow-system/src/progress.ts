import type { FlowProgressEvent } from "./executor.js";

export const ASSISTANT_TEXT_MAX_CHARS = 160;
export const PROGRESS_TEXT_MAX_CHARS = 96;
export const ASSISTANT_TEXT_THROTTLE_MS = 250;

interface ProgressTrackerOptions {
	now?: () => number;
	assistantTextMaxChars?: number;
	progressTextMaxChars?: number;
	assistantTextThrottleMs?: number;
}

export interface ProgressUpdate {
	summary: string;
	extras: {
		toolCount: number;
		lastProgress: string;
		lastAssistantText?: string;
	};
}

export interface FlowProgressTracker {
	readonly toolCount: number;
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

	let toolCount = 0;
	let lastAssistantPublishedText: string | undefined;
	let lastAssistantEmitAt: number | undefined;
	let pendingAssistantText: string | undefined;

	const fromProgress = (detail: string): ProgressUpdate | undefined => {
		const clipped = clipText(detail, progressTextMaxChars);
		if (clipped.length === 0) {
			return undefined;
		}
		return {
			summary: clipped,
			extras: {
				toolCount,
				lastProgress: clipped,
			},
		};
	};

	const fromAssistant = (detail: string): ProgressUpdate | undefined => {
		const clipped = clipText(detail, assistantTextMaxChars);
		if (clipped.length === 0) {
			return undefined;
		}
		pendingAssistantText = clipped;
		const at = now();
		if (lastAssistantEmitAt !== undefined && at - lastAssistantEmitAt < assistantTextThrottleMs) {
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
				lastProgress: toPublish,
				lastAssistantText: toPublish,
			},
		};
	};

	return {
		get toolCount() {
			return toolCount;
		},
		apply(event) {
			if (event._tag === "tool_start") {
				toolCount += 1;
				return fromProgress(event.detail);
			}
			if (event._tag === "tool_end") {
				return fromProgress(event.detail);
			}
			return fromAssistant(event.detail);
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
				extras: { toolCount, lastProgress: toPublish, lastAssistantText: toPublish },
			};
		},
	};
};
