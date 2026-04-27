import type { FlowJob, FlowQueue } from "../types.js";

export interface KeyFlashState {
	activeKey: string | null;
	flashTimeout: ReturnType<typeof setTimeout> | null;
}

export interface FlowDeckControllerState {
	selectedId: string | undefined;
	panelFocus: "queue" | "stream" | "summary";
	streamScroll: number;
	summaryScroll: number;
	followMode: boolean;
	compact: boolean;
	keyFlash: KeyFlashState;
	snapshot: FlowQueue;
}

const preferredJobId = (snapshot: FlowQueue): string | undefined => {
	const activeJob = snapshot.jobs.find((job) => job.status === "running" || job.status === "pending");
	return activeJob?.id ?? snapshot.jobs.at(-1)?.id;
};

export const makeInitialDeckControllerState = (snapshot: FlowQueue): FlowDeckControllerState => ({
	selectedId: preferredJobId(snapshot),
	panelFocus: "queue",
	streamScroll: 0,
	summaryScroll: 0,
	followMode: true,
	compact: false,
	keyFlash: { activeKey: null, flashTimeout: null },
	snapshot,
});

const firstJobId = (snapshot: FlowQueue): string | undefined => preferredJobId(snapshot);

export const clampSelection = (state: FlowDeckControllerState): FlowDeckControllerState =>
	state.snapshot.jobs.some((job) => job.id === state.selectedId)
		? state
		: {
				...state,
				selectedId: firstJobId(state.snapshot),
				streamScroll: 0,
				summaryScroll: 0,
				followMode: true,
		  };

export const syncSnapshot = (
	state: FlowDeckControllerState,
	snapshot: FlowQueue,
): FlowDeckControllerState => {
	const next = clampSelection({ ...state, snapshot });
	if (next.selectedId !== state.selectedId) {
		return { ...next, streamScroll: 0, summaryScroll: 0, followMode: true };
	}
	return next;
};

export const selectedJob = (state: FlowDeckControllerState): FlowJob | undefined =>
	state.snapshot.jobs.find((job) => job.id === state.selectedId);

const selectedIndex = (state: FlowDeckControllerState): number =>
	state.snapshot.jobs.findIndex((job) => job.id === state.selectedId);

export const moveSelection = (
	state: FlowDeckControllerState,
	direction: -1 | 1,
): FlowDeckControllerState => {
	const index = selectedIndex(state);
	if (index === -1) {
		return state;
	}
	const next = state.snapshot.jobs[index + direction];
	if (next === undefined) {
		return state;
	}
	return {
		...state,
		selectedId: next.id,
		streamScroll: 0,
		summaryScroll: 0,
		followMode: true,
	};
};

export const cyclePanelFocus = (state: FlowDeckControllerState): FlowDeckControllerState => ({
	...state,
	panelFocus:
		state.panelFocus === "queue"
			? "stream"
			: state.panelFocus === "stream"
				? "summary"
				: "queue",
});

export const toggleFollowMode = (state: FlowDeckControllerState): FlowDeckControllerState => ({
	...state,
	followMode: !state.followMode,
	...(state.followMode ? {} : { streamScroll: 0 }),
});

export const scrollFocusedPanel = (
	state: FlowDeckControllerState,
	delta: number,
	streamMetrics?: { rowCount: number; pageSize: number },
): FlowDeckControllerState => {
	if (delta === 0) {
		return state;
	}
	if (state.panelFocus === "summary") {
		return { ...state, summaryScroll: Math.max(0, state.summaryScroll - delta) };
	}
	if (state.panelFocus === "stream") {
		const rowCount = streamMetrics?.rowCount ?? 0;
		const pageSize = streamMetrics?.pageSize ?? 0;
		const maxStart = Math.max(0, rowCount - pageSize);
		if (state.followMode) {
			if (delta <= 0 || maxStart === 0) {
				return state;
			}
			return {
				...state,
				streamScroll: Math.max(0, maxStart - delta),
				followMode: false,
			};
		}
		const nextScroll = Math.min(maxStart, Math.max(0, state.streamScroll - delta));
		if (delta < 0 && nextScroll >= maxStart) {
			return {
				...state,
				streamScroll: 0,
				followMode: true,
			};
		}
		return {
			...state,
			streamScroll: nextScroll,
			followMode: false,
		};
	}
	return state;
};

export const setCompactMode = (
	state: FlowDeckControllerState,
	compact: boolean,
): FlowDeckControllerState => ({
	...state,
	compact,
});

export const setKeyFlash = (
	state: FlowDeckControllerState,
	activeKey: string | null,
	flashTimeout: ReturnType<typeof setTimeout> | null,
): FlowDeckControllerState => ({
	...state,
	keyFlash: { activeKey, flashTimeout },
});
