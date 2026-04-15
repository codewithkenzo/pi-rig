// deck/state.ts — plain TypeScript state, no Effect, no Ref
// Lives only for the duration of the overlay session.

import { stripAnsi } from "../../../../shared/ui/hud.js";
import type { FlowQueue } from "../types.js";

// Strip control bytes that would corrupt the TUI render (but preserve printable chars).
const FEED_CONTROL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f]/g;

const sanitizeFeed = (text: string): string =>
	stripAnsi(text).replace(FEED_CONTROL_RE, "");

export interface FeedLine {
	text: string;
	ts: number;
}

export interface FeedState {
	lines: FeedLine[];
	last_progress: string | undefined;
	last_assistant: string | undefined;
}

export interface KeyFlashState {
	active_key: string | null;
	flash_timeout: ReturnType<typeof setTimeout> | null;
}

export interface DeckState {
	selected_id: string | undefined;
	scroll_offset: number;
	feed: FeedState;
	key_flash: KeyFlashState;
	compact: boolean;
	snapshot: FlowQueue;
}

const FEED_CAP = 32;

export const makeInitialDeckState = (snapshot: FlowQueue): DeckState => ({
	selected_id: snapshot.jobs[0]?.id,
	scroll_offset: 0,
	feed: { lines: [], last_progress: undefined, last_assistant: undefined },
	key_flash: { active_key: null, flash_timeout: null },
	compact: false,
	snapshot,
});

/** Keep selected_id pointing at a valid job; clamp to first if stale. */
export const clampSelection = (state: DeckState): DeckState => {
	const jobs = state.snapshot.jobs;
	if (jobs.some((j) => j.id === state.selected_id)) return state;
	return { ...state, selected_id: jobs[0]?.id, scroll_offset: 0 };
};

const appendLine = (state: DeckState, text: string, ts: number): DeckState => {
	const trimmed = sanitizeFeed(text).trim();
	if (trimmed.length === 0) return state;
	const prev = state.feed.lines.at(-1);
	if (prev?.text === trimmed) return state;
	const lines = [...state.feed.lines, { text: trimmed, ts }].slice(-FEED_CAP);
	return { ...state, feed: { ...state.feed, lines } };
};

/**
 * Clear the activity feed and scroll position — call whenever selected_id changes
 * so stale lines from the previous job don't bleed into the new selection.
 */
export const resetFeed = (state: DeckState): DeckState => ({
	...state,
	scroll_offset: 0,
	feed: { lines: [], last_progress: undefined, last_assistant: undefined },
});

/** Pull new progress/assistant text from the selected job into the feed. */
export const updateFeedFromSnapshot = (state: DeckState): DeckState => {
	const job = state.snapshot.jobs.find((j) => j.id === state.selected_id);
	if (job === undefined) return state;

	let next = state;
	const ts = Date.now();

	if (job.lastProgress !== undefined && job.lastProgress !== state.feed.last_progress) {
		next = appendLine(next, job.lastProgress, ts);
		next = { ...next, feed: { ...next.feed, last_progress: job.lastProgress } };
	}

	if (job.lastAssistantText !== undefined && job.lastAssistantText !== state.feed.last_assistant) {
		next = appendLine(next, job.lastAssistantText, ts);
		next = { ...next, feed: { ...next.feed, last_assistant: job.lastAssistantText } };
	}

	return next;
};
