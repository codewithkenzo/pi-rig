import type { CustomEntry, SessionEntry } from "@mariozechner/pi-coding-agent";
import { THEME_ENTRY_TYPE, type ThemeStateEntry } from "./types.js";
import type { ThemeState, ThemeSwitcherContext } from "./state.js";

const isThemeStateEntry = (value: unknown): value is ThemeStateEntry => {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return typeof record["active"] === "string";
};

export const findSavedThemeEntry = (
	entries: readonly SessionEntry[],
): ThemeStateEntry | undefined =>
	entries
		.filter(
			(entry): entry is CustomEntry<ThemeStateEntry> =>
				entry.type === "custom" &&
				entry.customType === THEME_ENTRY_TYPE &&
				isThemeStateEntry(entry.data),
		)
		.at(-1)?.data;

export const restoreThemeEntry = async (
	ctx: ThemeSwitcherContext,
	state: ThemeState,
	entry: ThemeStateEntry | undefined,
): Promise<boolean> => {
	if (entry === undefined || entry.active.trim() === "") {
		return false;
	}

	const result = ctx.ui.setTheme(entry.active);
	if (!result.success) {
		return false;
	}

	state.setActive(entry.active);
	return true;
};

export const snapshotThemeEntry = (state: ThemeState): ThemeStateEntry => ({
	active: state.getActive(),
});
