import type { ThemeEngine } from "../theme/engine.js";

type Tone = "accent" | "success" | "error" | "warning" | "muted" | "active" | "inactive" | "label" | "value";

const ANSI_PATTERN = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
const OSC_PATTERN = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

export const stripAnsi = (text: string): string => text.replace(OSC_PATTERN, "").replace(ANSI_PATTERN, "");

const isZeroWidth = (cp: number): boolean =>
	(cp >= 0x0300 && cp <= 0x036f) ||
	(cp >= 0x1ab0 && cp <= 0x1aff) ||
	(cp >= 0x1dc0 && cp <= 0x1dff) ||
	(cp >= 0x20d0 && cp <= 0x20ff) ||
	(cp >= 0xfe00 && cp <= 0xfe0f) ||
	cp === 0x200d;

const isWide = (cp: number): boolean =>
	(cp >= 0x1100 && cp <= 0x115f) ||
	(cp >= 0x2329 && cp <= 0x232a) ||
	(cp >= 0x2600 && cp <= 0x27bf) ||
	(cp >= 0x2e80 && cp <= 0x303e) ||
	(cp >= 0x3041 && cp <= 0x33ff) ||
	(cp >= 0x3400 && cp <= 0x4dbf) ||
	(cp >= 0x4e00 && cp <= 0x9fff) ||
	(cp >= 0xac00 && cp <= 0xd7af) ||
	(cp >= 0xf900 && cp <= 0xfaff) ||
	(cp >= 0xff01 && cp <= 0xff60) ||
	(cp >= 0xffe0 && cp <= 0xffe6) ||
	(cp >= 0x1f000 && cp <= 0x1faff);

export const visibleWidth = (text: string): number => {
	let width = 0;
	for (const ch of stripAnsi(text)) {
		const cp = ch.codePointAt(0) ?? 0;
		if (!isZeroWidth(cp)) {
			width += isWide(cp) ? 2 : 1;
		}
	}
	return width;
};

export const ellipsize = (text: string, max: number): string => {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (visibleWidth(normalized) <= max) {
		return normalized;
	}
	if (max <= 1) {
		return "…";
	}

	let result = "";
	let width = 0;
	for (const ch of normalized) {
		const cp = ch.codePointAt(0) ?? 0;
		const charWidth = isZeroWidth(cp) ? 0 : isWide(cp) ? 2 : 1;
		if (width + charWidth > max - 1) {
			break;
		}
		result += ch;
		width += charWidth;
	}
	return `${result}…`;
};

export const fitAnsiLine = (line: string, width: number): string => {
	const safeWidth = Math.max(1, width);
	if (visibleWidth(line) <= safeWidth) {
		return line;
	}
	return ellipsize(stripAnsi(line), safeWidth);
};

export const joinCompact = (engine: ThemeEngine, segments: Array<string | undefined | false>): string =>
	segments.filter((segment): segment is string => typeof segment === "string" && segment.length > 0).join(engine.fg("muted", " · "));

export const metric = (
	engine: ThemeEngine,
	tone: Tone,
	icon: string,
	label: string,
): string => `${engine.fg(tone, icon)} ${engine.fg("value", label)}`;

export const tag = (engine: ThemeEngine, tone: Tone, label: string): string =>
	`${engine.fg("muted", "[")}${engine.fg(tone, label)}${engine.fg("muted", "]")}`;

export const hintLine = (engine: ThemeEngine, text: string): string => engine.dim(text);

export const flowTone = (status: "pending" | "running" | "done" | "failed" | "cancelled"): Tone => {
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
