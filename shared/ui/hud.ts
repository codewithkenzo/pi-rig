import type { ThemeEngine } from "../theme/engine.js";

type Tone = "accent" | "success" | "error" | "warning" | "muted" | "active" | "inactive" | "label" | "value";

const ANSI_PATTERN = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export const stripAnsi = (text: string): string => text.replace(ANSI_PATTERN, "");

export const ellipsize = (text: string, max: number): string => {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= max) {
		return normalized;
	}
	if (max <= 1) {
		return "…";
	}
	return `${normalized.slice(0, Math.max(0, max - 1))}…`;
};

export const fitAnsiLine = (line: string, width: number): string => {
	const safeWidth = Math.max(1, width);
	const plain = stripAnsi(line);
	if (plain.length <= safeWidth) {
		return line;
	}
	return ellipsize(plain, safeWidth);
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
