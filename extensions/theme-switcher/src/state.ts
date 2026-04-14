import { Effect } from "effect";
import { BUILTIN_PALETTES, PALETTE_MAP, getPalette } from "../../../shared/theme/index.js";
import { ThemeLoadError, ThemeNotFoundError } from "./types.js";

const DEFAULT_THEME_BY_VARIANT = {
	dark: "catppuccin-mocha",
	light: "catppuccin-latte",
} as const;

const isKnownThemeName = (name: string): boolean => PALETTE_MAP.has(name);

const firstThemeByVariant = (variant: "dark" | "light"): string | undefined => {
	for (const palette of PALETTE_MAP.values()) {
		if (palette.variant === variant) {
			return palette.name;
		}
	}
	return undefined;
};

const defaultThemeName = (): string =>
	PALETTE_MAP.has(DEFAULT_THEME_BY_VARIANT.dark)
		? DEFAULT_THEME_BY_VARIANT.dark
		: BUILTIN_PALETTES[0]?.name ?? DEFAULT_THEME_BY_VARIANT.dark;

const fallbackThemeForVariant = (
	variant: "dark" | "light",
	currentActive: string,
): string => {
	const preferred = DEFAULT_THEME_BY_VARIANT[variant];
	if (PALETTE_MAP.has(preferred)) {
		return preferred;
	}
	const first = firstThemeByVariant(variant);
	return first ?? currentActive;
};

export const resolveThemeName = (
	candidate: string | undefined,
	currentActive: string,
): string => {
	const normalized = candidate?.trim();
	if (normalized === undefined || normalized === "") {
		return currentActive;
	}

	if (isKnownThemeName(normalized)) {
		return normalized;
	}

	if (normalized === "dark" || normalized === "light") {
		const current = PALETTE_MAP.get(currentActive);
		if (current?.variant === normalized) {
			return currentActive;
		}
		return fallbackThemeForVariant(normalized, currentActive);
	}

	return currentActive;
};

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
	let active = resolveThemeName(initial, defaultThemeName());

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
	const resolved = resolveThemeName(themeName, state.getActive());
	if (resolved !== state.getActive()) {
		state.setActive(resolved);
	}

	return state.getActive();
};

export const applyTheme = (
	ctx: ThemeSwitcherContext,
	name: string,
	state: ThemeState,
	options?: { emitChangedEvent?: boolean },
): Effect.Effect<void, ThemeNotFoundError | ThemeLoadError> =>
	Effect.gen(function* () {
		syncThemeStateFromUi(state, ctx.ui.theme.name);

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
		if (options?.emitChangedEvent !== false) {
			ctx.events?.emit("theme:changed", { theme: name });
		}
	});
