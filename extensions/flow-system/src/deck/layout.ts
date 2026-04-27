import { stripAnsi } from "../../../../shared/ui/hud.js";

const TAB_STOP = 4;
const ELLIPSIS = "…";

const isWide = (cp: number): boolean =>
	(cp >= 0x1100 && cp <= 0x115f) ||  // Hangul Jamo
	(cp >= 0x2e80 && cp <= 0x303e) ||  // CJK Radicals
	(cp >= 0x3041 && cp <= 0x33ff) ||  // Japanese
	(cp >= 0x3400 && cp <= 0x4dbf) ||  // CJK Extension A
	(cp >= 0x4e00 && cp <= 0x9fff) ||  // CJK Unified
	(cp >= 0xac00 && cp <= 0xd7af) ||  // Hangul Syllables
	(cp >= 0xf900 && cp <= 0xfaff) ||  // CJK Compat
	(cp >= 0xff01 && cp <= 0xff60) ||  // Fullwidth Latin
	(cp >= 0xffe0 && cp <= 0xffe6);    // Fullwidth signs

const OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

const isCombining = (cp: number): boolean =>
	(cp >= 0x0300 && cp <= 0x036f) ||
	(cp >= 0x0483 && cp <= 0x0489) ||
	(cp >= 0x0591 && cp <= 0x05bd) ||
	cp === 0x05bf ||
	(cp >= 0x05c1 && cp <= 0x05c2) ||
	(cp >= 0x05c4 && cp <= 0x05c5) ||
	cp === 0x05c7 ||
	(cp >= 0x0610 && cp <= 0x061a) ||
	(cp >= 0x064b && cp <= 0x065f) ||
	cp === 0x0670 ||
	(cp >= 0x06d6 && cp <= 0x06dc) ||
	(cp >= 0x06df && cp <= 0x06e4) ||
	(cp >= 0x06e7 && cp <= 0x06e8) ||
	(cp >= 0x06ea && cp <= 0x06ed) ||
	cp === 0x0711 ||
	(cp >= 0x0730 && cp <= 0x074a) ||
	(cp >= 0x07a6 && cp <= 0x07b0) ||
	(cp >= 0x07eb && cp <= 0x07f3) ||
	(cp >= 0x0816 && cp <= 0x0819) ||
	(cp >= 0x081b && cp <= 0x0823) ||
	(cp >= 0x0825 && cp <= 0x0827) ||
	(cp >= 0x0829 && cp <= 0x082d) ||
	(cp >= 0x0859 && cp <= 0x085b) ||
	(cp >= 0x08d3 && cp <= 0x0903) ||
	(cp >= 0x093a && cp <= 0x093c) ||
	(cp >= 0x0941 && cp <= 0x0948) ||
	(cp >= 0x094d && cp <= 0x094e) ||
	(cp >= 0x0951 && cp <= 0x0957) ||
	(cp >= 0x0962 && cp <= 0x0963) ||
	(cp >= 0x1ab0 && cp <= 0x1aff) ||
	(cp >= 0x1dc0 && cp <= 0x1dff) ||
	(cp >= 0x20d0 && cp <= 0x20ff) ||
	(cp >= 0xfe20 && cp <= 0xfe2f);

const isVariationSelector = (cp: number): boolean =>
	(cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef);

const isEmojiModifier = (cp: number): boolean => cp >= 0x1f3fb && cp <= 0x1f3ff;

const isRegionalIndicator = (cp: number): boolean => cp >= 0x1f1e6 && cp <= 0x1f1ff;

const isEmojiPresentation = (cp: number): boolean =>
	(cp >= 0x1f000 && cp <= 0x1faff) ||
	(cp >= 0x1fc00 && cp <= 0x1fffd);

const isEmojiSymbol = (cp: number): boolean =>
	(cp >= 0x2300 && cp <= 0x23ff) ||
	(cp >= 0x2600 && cp <= 0x27bf) ||
	cp === 0x0023 ||
	cp === 0x002a ||
	(cp >= 0x0030 && cp <= 0x0039);

const isZeroWidthFormat = (cp: number): boolean =>
	cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0xfeff;

const isIgnorable = (cp: number): boolean =>
	isCombining(cp) || isVariationSelector(cp) || isEmojiModifier(cp) || isZeroWidthFormat(cp);

const codePointSize = (cp: number): number => cp > 0xffff ? 2 : 1;

const tabWidth = (currentWidth: number): number => {
	const mod = currentWidth % TAB_STOP;
	return mod === 0 ? TAB_STOP : TAB_STOP - mod;
};

const readAnsiSequence = (text: string, index: number): { sequence: string; next: number } | undefined => {
	if (text[index] !== "\x1b") {
		return undefined;
	}
	if (text[index + 1] === "[") {
		const match = /^\x1b\[[0-?]*[ -/]*[@-~]/.exec(text.slice(index));
		return match === null ? undefined : { sequence: match[0], next: index + match[0].length };
	}
	if (text[index + 1] === "]") {
		const rest = text.slice(index);
		const bel = rest.indexOf("\x07");
		const st = rest.indexOf("\x1b\\");
		if (bel !== -1 && (st === -1 || bel < st)) {
			return { sequence: "", next: index + bel + 1 };
		}
		if (st !== -1) {
			return { sequence: "", next: index + st + 2 };
		}
		return { sequence: "", next: text.length };
	}
	return undefined;
};

const consumeEmojiSuffix = (text: string, index: number): { next: number; emojiVariation: boolean; keycap: boolean } => {
	let next = index;
	let emojiVariation = false;
	let keycap = false;
	while (next < text.length) {
		const cp = text.codePointAt(next) ?? 0;
		if (cp === 0xfe0f) {
			emojiVariation = true;
			next += codePointSize(cp);
			continue;
		}
		if (cp === 0x20e3) {
			keycap = true;
			next += codePointSize(cp);
			continue;
		}
		if (isVariationSelector(cp) || isCombining(cp) || isEmojiModifier(cp)) {
			next += codePointSize(cp);
			continue;
		}
		break;
	}
	return { next, emojiVariation, keycap };
};

const consumeEmojiJoiners = (text: string, index: number): { next: number; joinedEmoji: boolean } => {
	let next = index;
	let joinedEmoji = false;
	while (next < text.length) {
		const joiner = text.codePointAt(next) ?? 0;
		if (joiner !== 0x200d) {
			break;
		}
		const afterJoiner = next + codePointSize(joiner);
		if (afterJoiner >= text.length) {
			break;
		}
		const cp = text.codePointAt(afterJoiner) ?? 0;
		if (!isEmojiPresentation(cp) && !isEmojiSymbol(cp)) {
			break;
		}
		joinedEmoji = true;
		next = afterJoiner + codePointSize(cp);
		const suffix = consumeEmojiSuffix(text, next);
		next = suffix.next;
	}
	return { next, joinedEmoji };
};

const readCell = (text: string, index: number, currentWidth: number): { text: string; width: number; next: number } => {
	const cp = text.codePointAt(index) ?? 0;
	const size = codePointSize(cp);

	if (cp === 0x09) {
		const width = tabWidth(currentWidth);
		return { text: " ".repeat(width), width, next: index + size };
	}
	if (cp === 0x0a || cp === 0x0d) {
		const next = cp === 0x0d && text.codePointAt(index + size) === 0x0a ? index + size + 1 : index + size;
		return { text: " ", width: 1, next };
	}
	if ((cp >= 0x00 && cp <= 0x1f) || cp === 0x7f || isIgnorable(cp)) {
		return { text: "", width: 0, next: index + size };
	}
	if (isRegionalIndicator(cp)) {
		let next = index + size;
		const nextCp = text.codePointAt(next) ?? 0;
		if (isRegionalIndicator(nextCp)) {
			next += codePointSize(nextCp);
		}
		return { text: text.slice(index, next), width: 2, next };
	}

	let next = index + size;
	const suffix = consumeEmojiSuffix(text, next);
	next = suffix.next;
	const joiners = consumeEmojiJoiners(text, next);
	next = joiners.next;
	const emoji = isEmojiPresentation(cp) || (isEmojiSymbol(cp) && (suffix.emojiVariation || suffix.keycap || joiners.joinedEmoji));
	return {
		text: text.slice(index, next),
		width: emoji || isWide(cp) ? 2 : 1,
		next,
	};
};

const terminalCells = (text: string): Array<{ text: string; width: number }> => {
	const plain = stripAnsi(text.replace(OSC_RE, ""));
	const cells: Array<{ text: string; width: number }> = [];
	let i = 0;
	let w = 0;
	while (i < plain.length) {
		const cell = readCell(plain, i, w);
		if (cell.width > 0 || cell.text.length > 0) {
			cells.push({ text: cell.text, width: cell.width });
		}
		w += cell.width;
		i = cell.next;
	}
	return cells;
};

export const visibleWidth = (text: string): number => {
	let width = 0;
	for (const cell of terminalCells(text)) {
		width += cell.width;
	}
	return width;
};

export const truncateToWidth = (text: string, width: number): string => {
	const safeWidth = Math.max(0, width);
	if (safeWidth === 0) {
		return "";
	}
	const cells = terminalCells(text);
	const vw = cells.reduce((sum, cell) => sum + cell.width, 0);
	if (vw <= safeWidth) {
		return cells.map((cell) => cell.text).join("") + " ".repeat(safeWidth - vw);
	}
	let result = "";
	let w = 0;
	for (const cell of cells) {
		if (w + cell.width > safeWidth - 1) break;
		result += cell.text;
		w += cell.width;
	}
	return result + ELLIPSIS + " ".repeat(Math.max(0, safeWidth - w - 1));
};

export const fitAnsiColumn = (text: string, width: number): string => {
	const safeWidth = Math.max(0, width);
	if (safeWidth === 0) {
		return "";
	}
	const vw = visibleWidth(text);
	if (vw <= safeWidth) {
		let normalized = "";
		let normalizedWidth = 0;
		let index = 0;
		while (index < text.length) {
			const ansi = readAnsiSequence(text, index);
			if (ansi !== undefined) {
				normalized += ansi.sequence;
				index = ansi.next;
				continue;
			}
			const cell = readCell(text, index, normalizedWidth);
			normalized += cell.text;
			normalizedWidth += cell.width;
			index = cell.next;
		}
		return normalized + " ".repeat(safeWidth - normalizedWidth);
	}
	// Walk through the raw string, copy ANSI sequences verbatim, truncate visible chars.
	let result = "";
	let visW = 0;
	let i = 0;
	while (i < text.length) {
		const ansi = readAnsiSequence(text, i);
		if (ansi !== undefined) {
			result += ansi.sequence;
			i = ansi.next;
			continue;
		}
		const cell = readCell(text, i, visW);
		if (visW + cell.width > safeWidth - 1) break;
		result += cell.text;
		visW += cell.width;
		i = cell.next;
	}
	return result + "\x1b[0m" + ELLIPSIS + " ".repeat(Math.max(0, safeWidth - visW - 1));
};

export const zipColumns = (
	left: string[],
	right: string[],
	leftWidth: number,
	totalWidth: number,
	separator: string,
): string[] => {
	const sepWidth = visibleWidth(separator);
	const rightWidth = Math.max(1, totalWidth - leftWidth - sepWidth);
	const rows = Math.max(left.length, right.length);
	const result: string[] = [];

	for (let i = 0; i < rows; i++) {
		const l = fitAnsiColumn(left[i] ?? "", leftWidth);
		const r = fitAnsiColumn(right[i] ?? "", rightWidth);
		result.push(`${l}${separator}${r}`);
	}

	return result;
};
