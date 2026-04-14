import { Effect } from "effect";
import { BUILTIN_PALETTES, PALETTE_MAP, getPalette } from "../../../shared/theme/index.js";
import { ThemeLoadError, ThemeNotFoundError } from "./types.js";

const getThemeNames = (): string[] =>
	Array.from(
		new Set([
			...BUILTIN_PALETTES.map((palette) => palette.name),
			...PALETTE_MAP.keys(),
		]),
	);

export interface ThemeState {
	getActive(): string;
	setActive(name: string): void;
	getNextName(): string;
}

export interface ThemeSwitcherContext {
	ui: {
		setTheme(theme: string): {
			success: boolean;
			error?: string;
		};
		theme: {
			name?: string;
		};
	};
	events?: {
		emit(event: string, payload?: unknown): void;
	};
}

export const makeThemeState = (initial: string): ThemeState => {
	let active = initial;

	return {
		getActive: () => active,
		setActive: (name: string) => {
			active = name;
		},
		getNextName: () => {
			const themeNames = getThemeNames();
			if (themeNames.length === 0) {
				return active;
			}

			const currentIndex = themeNames.indexOf(active);
			if (currentIndex === -1) {
				return themeNames[0] ?? active;
			}

			return themeNames[(currentIndex + 1) % themeNames.length] ?? active;
		},
	};
};

export const syncThemeStateFromUi = (
	state: ThemeState,
	themeName: string | undefined,
): string => {
	if (themeName !== undefined && themeName !== state.getActive()) {
		state.setActive(themeName);
	}

	return state.getActive();
};

export const applyTheme = (
	ctx: ThemeSwitcherContext,
	name: string,
	state: ThemeState,
): Effect.Effect<void, ThemeNotFoundError | ThemeLoadError> =>
	Effect.gen(function* () {
		yield* Effect.try({
			try: () => {
				getPalette(name);
			},
			catch: () => new ThemeNotFoundError({ name }),
		});

		const result = ctx.ui.setTheme(name);
		if (!result.success) {
			yield* Effect.fail(
				new ThemeLoadError({
					reason: result.error ?? `Failed to load theme "${name}"`,
				}),
			);
		}

		state.setActive(name);
		ctx.events?.emit("theme:changed", { theme: name });
	});
