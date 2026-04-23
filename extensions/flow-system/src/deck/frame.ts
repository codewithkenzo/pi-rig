const OVERLAY_MAX_HEIGHT_RATIO = 0.88;
const OVERLAY_VERTICAL_MARGIN = 2;

const HEADER_HEIGHT = 3;
const FOOTER_HEIGHT = 3;

const DEFAULT_FRAME_HEIGHT_WIDE = 30;
const DEFAULT_FRAME_HEIGHT_COMPACT = 26;
const DEFAULT_SUMMARY_HEIGHT_WIDE = 10;
const DEFAULT_SUMMARY_HEIGHT_COMPACT = 8;

const MIN_SECTION_HEIGHT = 5;

export interface DeckFrameLayout {
	frameHeight: number;
	columnsHeight: number;
	summaryHeight: number;
}

const clamp = (value: number, min: number, max: number): number =>
	Math.max(min, Math.min(max, value));

export const computeDeckFrameLayout = (
	termRows: number,
	compact: boolean,
): DeckFrameLayout => {
	const maxHeightByRatio = Math.floor(termRows * OVERLAY_MAX_HEIGHT_RATIO);
	const maxHeightByMargin = Math.max(1, termRows - OVERLAY_VERTICAL_MARGIN);
	const maxFrameHeight = Math.max(1, Math.min(maxHeightByRatio, maxHeightByMargin));
	const preferredFrameHeight = compact ? DEFAULT_FRAME_HEIGHT_COMPACT : DEFAULT_FRAME_HEIGHT_WIDE;
	const frameHeight = clamp(preferredFrameHeight, 1, maxFrameHeight);

	const bodyHeight = Math.max(2, frameHeight - HEADER_HEIGHT - FOOTER_HEIGHT);
	if (bodyHeight <= MIN_SECTION_HEIGHT * 2) {
		const summaryHeight = Math.max(1, Math.floor(bodyHeight * 0.45));
		const columnsHeight = Math.max(1, bodyHeight - summaryHeight);
		return { frameHeight, columnsHeight, summaryHeight };
	}

	const preferredSummaryHeight = compact
		? DEFAULT_SUMMARY_HEIGHT_COMPACT
		: DEFAULT_SUMMARY_HEIGHT_WIDE;
	const summaryHeight = clamp(
		preferredSummaryHeight,
		MIN_SECTION_HEIGHT,
		bodyHeight - MIN_SECTION_HEIGHT,
	);
	const columnsHeight = Math.max(MIN_SECTION_HEIGHT, bodyHeight - summaryHeight);

	return {
		frameHeight,
		columnsHeight,
		summaryHeight: Math.max(1, bodyHeight - columnsHeight),
	};
};

export const DECK_FIXED_CHROME_HEIGHT = HEADER_HEIGHT + FOOTER_HEIGHT;
