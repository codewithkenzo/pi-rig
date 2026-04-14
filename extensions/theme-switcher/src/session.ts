import type { CustomEntry, SessionEntry } from "@mariozechner/pi-coding-agent";
import { Effect } from "effect";
import { THEME_ENTRY_TYPE, type ThemeStateEntry } from "./types.js";
import { applyTheme, resolveThemeName, type ThemeState, type ThemeSwitcherContext } from "./state.js";

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

	const restoredTheme = resolveThemeName(entry.active, state.getActive());
	const result = await Effect.runPromise(applyTheme(ctx, restoredTheme, state, { emitChangedEvent: false }).pipe(Effect.result));
	return result._tag === "Success";
};

export const snapshotThemeEntry = (state: ThemeState): ThemeStateEntry => ({
	active: state.getActive(),
});
