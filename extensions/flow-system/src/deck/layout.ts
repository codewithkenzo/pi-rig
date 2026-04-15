// deck/layout.ts — Width helpers and two-column layout.
// Uses visibleWidth() (not fitAnsiLine) because fitAnsiLine doesn't pad.

import { stripAnsi } from "../../../../shared/ui/hud.js";

// ─── Wide-char lookup ─────────────────────────────────────────────────────────
// Returns 2 for CJK/fullwidth codepoints, 1 otherwise.
// Nerd Font glyphs are typically 1-wide in patched terminals.

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

// OSC sequences (\x1b]...\x07 or \x1b]...\x1b\) are zero-width escape data.
// stripAnsi strips CSI/SGR but not OSC — pre-strip here to avoid over-counting.
const OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

/**
 * Visible column width of a string — strips ANSI and OSC sequences, counts wide chars as 2.
 */
export const visibleWidth = (text: string): number => {
	const plain = stripAnsi(text.replace(OSC_RE, ""));
	let w = 0;
	for (const ch of plain) {
		w += isWide(ch.codePointAt(0) ?? 0) ? 2 : 1;
	}
	return w;
};

/**
 * Pad or truncate `text` to exactly `width` visible columns.
 * Always returns plain text (no ANSI). Suitable for column-aligned rows.
 */
export const truncateToWidth = (text: string, width: number): string => {
	const plain = stripAnsi(text);
	const vw = visibleWidth(plain);
	if (vw <= width) {
		return plain + " ".repeat(width - vw);
	}
	// Trim chars until we fit, then add ellipsis
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

/**
 * Fit an ANSI-colored string into exactly `width` visible columns.
 * Preserves all ANSI escape sequences in the output (unlike truncateToWidth).
 * Pads with spaces when shorter; truncates with "…" when longer.
 */
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
		// Consume CSI/SGR sequences verbatim: \x1b[ ... <letter>
		if (text[i] === "\x1b" && text[i + 1] === "[") {
			const m = /^\x1b\[[0-9;]*[A-Za-z]/.exec(text.slice(i));
			if (m !== null) {
				result += m[0];
				i += m[0].length;
				continue;
			}
		}
		// Consume OSC sequences verbatim: \x1b] ... BEL or \x1b] ... ST(\x1b\\)
		// Without this, hyperlink escapes are consumed char-by-char and inflate visW.
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

/**
 * Merge two column arrays into a single array of rows.
 * Each row: left (padded to leftWidth) + separator + right (padded to rightWidth).
 * The right column receives the remaining width after separator.
 * ANSI colors/animations in each cell are preserved.
 */
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
