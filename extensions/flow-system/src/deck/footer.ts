import type { ThemeEngine } from "../../../../shared/theme/engine.js";
import type { KeyFlashState } from "./state.js";

interface Keybind {
	key: string;
	label: string;
}

const BINDS: Keybind[] = [
	{ key: "^C",     label: "exit" },
	{ key: "c",      label: "cancel" },
	{ key: "↑↓",    label: "select" },
	{ key: "PgUp/Dn", label: "scroll" },
	{ key: "esc",    label: "close" },
];

const BINDS_ICON_ONLY: Keybind[] = [
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

export const renderFooter = (
	engine: ThemeEngine,
	keyFlash: KeyFlashState,
	width: number,
	compact: boolean,
	veryNarrow: boolean,
): string[] => {
	const binds = veryNarrow ? BINDS_ICON_ONLY : BINDS;
	const pills = binds.map((b) =>
		pill(engine, b.key, b.label, keyFlash.active_key === b.key, veryNarrow || compact),
	);
	const line = "  " + pills.join(engine.fg("muted", "  "));
	const divider = engine.fg("border", "─".repeat(width));
	return [divider, line, divider];
};
