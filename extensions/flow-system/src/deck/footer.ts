import type { ThemeEngine } from "../../../../shared/theme/engine.js";
import { fitAnsiColumn } from "./layout.js";
import type { FlowQueue } from "../types.js";
import type { KeyFlashState } from "./state.js";

interface Keybind {
	key: string;
	label: string;
}

const BINDS: Keybind[] = [
	{ key: "tab",    label: "panel" },
	{ key: "f",      label: "follow" },
	{ key: "r",      label: "refresh" },
	{ key: "^C",     label: "exit" },
	{ key: "c",      label: "cancel" },
	{ key: "↑↓",    label: "move/scroll" },
	{ key: "PgUp/Dn", label: "scroll" },
	{ key: "esc",    label: "close" },
];

const BINDS_ICON_ONLY: Keybind[] = [
	{ key: "tab", label: "" },
	{ key: "f", label: "" },
	{ key: "r", label: "" },
	{ key: "^C",  label: "" },
	{ key: "c",   label: "" },
	{ key: "↑↓", label: "" },
	{ key: "esc", label: "" },
];

const pill = (
	engine: ThemeEngine,
	key: string,
	label: string,
	flashing: boolean,
	iconOnly: boolean,
): string => {
	const keyText = flashing
		? engine.fg("accent", `[${key}]`)
		: engine.fg("dim", `[${key}]`);
	if (iconOnly || label.length === 0) return keyText;
	return `${keyText} ${engine.fg("muted", label)}`;
};

const queueHealth = (queue: FlowQueue): { text: string; tone: "active" | "warning" | "success" | "muted" | "error" } => {
	const counts = {
		total: queue.jobs.length,
		running: queue.jobs.filter((job) => job.status === "running").length,
		pending: queue.jobs.filter((job) => job.status === "pending").length,
		failed: queue.jobs.filter((job) => job.status === "failed").length,
		done: queue.jobs.filter((job) => job.status === "done").length,
	};

	if (counts.total === 0) {
		return { text: "queue idle", tone: "muted" };
	}
	if (counts.failed > 0) {
		return { text: `queue ${counts.total} · ${counts.failed} failed`, tone: "error" };
	}
	if (counts.running > 0) {
		return { text: `queue ${counts.total} · ${counts.running} running · ${counts.pending} pending`, tone: "active" };
	}
	if (counts.pending > 0) {
		return { text: `queue ${counts.total} · ${counts.pending} pending`, tone: "warning" };
	}
	return { text: `queue ${counts.total} · ${counts.done} done`, tone: "success" };
};

export const renderFooter = (
	engine: ThemeEngine,
	keyFlash: KeyFlashState,
	queue: FlowQueue,
	width: number,
	compact: boolean,
	veryNarrow: boolean,
): string[] => {
	const binds = veryNarrow ? BINDS_ICON_ONLY : BINDS;
	const pills = binds.map((b) =>
		pill(engine, b.key, b.label, keyFlash.active_key === b.key, veryNarrow || compact),
	);
	const health = queueHealth(queue);
	const line = `  ${engine.fg(health.tone, health.text)}${engine.fg("muted", "  ")}${pills.join(engine.fg("muted", "  "))}`;
	const divider = engine.fg("border", "─".repeat(width));
	return [divider, fitAnsiColumn(line, width), divider];
};
