import type { SessionEntry } from "@mariozechner/pi-coding-agent";
import { Effect } from "effect";
import { findLatestCustomEntry } from "../../../shared/session.js";
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
	findLatestCustomEntry(entries, THEME_ENTRY_TYPE, isThemeStateEntry);

export const restoreThemeEntry = async (
	ctx: ThemeSwitcherContext,
	state: ThemeState,
	entry: ThemeStateEntry | undefined,
): Promise<boolean> => {
	if (entry === undefined || entry.active.trim() === "") {
		return false;
	}

	const candidate = entry.active.trim();
	const resolved = resolveThemeName(candidate, state.getActive());
	const preferred =
		resolved === state.getActive() &&
		candidate !== state.getActive() &&
		candidate !== "dark" &&
		candidate !== "light"
			? candidate
			: resolved;

	const attemptRestore = async (themeName: string): Promise<boolean> => {
		const result = await Effect.runPromise(
			applyTheme(ctx, themeName, state, {
				emitChangedEvent: false,
				persistPreference: false,
			}).pipe(Effect.result),
		);
		return result._tag === "Success";
	};

	if (await attemptRestore(preferred)) {
		return true;
	}
	if (preferred !== resolved) {
		return attemptRestore(resolved);
	}
	return false;
};

export const snapshotThemeEntry = (state: ThemeState): ThemeStateEntry => ({
	active: state.getActive(),
});
