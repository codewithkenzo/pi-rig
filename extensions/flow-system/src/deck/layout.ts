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

/**
 * Visible column width of a string — strips ANSI, counts wide chars as 2.
 */
export const visibleWidth = (text: string): number => {
	const plain = stripAnsi(text);
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
 * Merge two column arrays into a single array of rows.
 * Each row: left (padded to leftWidth) + separator + right (padded to rightWidth).
 * The right column receives the remaining width after separator.
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
		const l = truncateToWidth(left[i] ?? "", leftWidth);
		const r = truncateToWidth(right[i] ?? "", rightWidth);
		result.push(`${l}${separator}${r}`);
	}

	return result;
};
