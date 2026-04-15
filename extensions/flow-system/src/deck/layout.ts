import { stripAnsi } from "../../../../shared/ui/hud.js";

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

export const visibleWidth = (text: string): number => {
	const plain = stripAnsi(text.replace(OSC_RE, ""));
	let w = 0;
	for (const ch of plain) {
		w += isWide(ch.codePointAt(0) ?? 0) ? 2 : 1;
	}
	return w;
};

export const truncateToWidth = (text: string, width: number): string => {
	const plain = stripAnsi(text);
	const vw = visibleWidth(plain);
	if (vw <= width) {
		return plain + " ".repeat(width - vw);
	}
	let result = "";
	let w = 0;
	for (const ch of plain) {
		const cw = isWide(ch.codePointAt(0) ?? 0) ? 2 : 1;
		if (w + cw > width - 1) break;
		result += ch;
		w += cw;
	}
	return result + "…" + " ".repeat(Math.max(0, width - w - 1));
};

export const fitAnsiColumn = (text: string, width: number): string => {
	const vw = visibleWidth(text);
	if (vw <= width) {
		return text + " ".repeat(width - vw);
	}
	// Walk through the raw string, copy ANSI sequences verbatim, truncate visible chars.
	let result = "";
	let visW = 0;
	let i = 0;
	while (i < text.length) {
		if (text[i] === "\x1b" && text[i + 1] === "[") {
			const m = /^\x1b\[[0-9;]*[A-Za-z]/.exec(text.slice(i));
			if (m !== null) {
				result += m[0];
				i += m[0].length;
				continue;
			}
		}
		if (text[i] === "\x1b" && text[i + 1] === "]") {
			const rest = text.slice(i);
			const bel = rest.indexOf("\x07");
			const st  = rest.indexOf("\x1b\\");
			if (bel !== -1 && (st === -1 || bel < st)) {
				result += rest.slice(0, bel + 1);
				i += bel + 1;
			} else if (st !== -1) {
				result += rest.slice(0, st + 2);
				i += st + 2;
			} else {
				// Unterminated OSC — consume the rest of the string as escape data.
				result += rest;
				i = text.length;
			}
			continue;
		}
		const cp = text.codePointAt(i) ?? 0;
		const cw = isWide(cp) ? 2 : 1;
		if (visW + cw > width - 1) break;
		result += String.fromCodePoint(cp);
		visW += cw;
		i += cp > 0xffff ? 2 : 1;
	}
	return result + "\x1b[0m" + "…" + " ".repeat(Math.max(0, width - visW - 1));
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
