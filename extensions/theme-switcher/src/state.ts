import type { Theme } from "@mariozechner/pi-coding-agent";
import { Effect } from "effect";
import { BUILTIN_PALETTES, PALETTE_MAP, getPalette } from "../../../shared/theme/index.js";
import type { Palette } from "../../../shared/theme/types.js";
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
		setTheme(theme: string | Theme): {
			success: boolean;
			error?: string;
		};
		getTheme?: (name: string) => Theme | undefined;
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

const hexToRgb = (hex: string): [number, number, number] => {
	const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
	const value = Number.parseInt(normalized, 16);
	return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

const rgbToHex = (r: number, g: number, b: number): string =>
	`#${[r, g, b]
		.map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
		.join("")}`;

const blendHex = (base: string, overlay: string, amount: number): string => {
	const [br, bg, bb] = hexToRgb(base);
	const [or, og, ob] = hexToRgb(overlay);
	return rgbToHex(
		br + (or - br) * amount,
		bg + (og - bg) * amount,
		bb + (ob - bb) * amount,
	);
};

const pickBackground = (palette: Palette): string =>
	palette.raw["base"] ??
	palette.raw["background"] ??
	palette.raw["bg"] ??
	palette.raw["bg0"] ??
	palette.raw["base03"] ??
	palette.raw["crust"] ??
	palette.semantic.separator;

const toPiTheme = (ctx: ThemeSwitcherContext, palette: Palette): Theme => {
	const ThemeCtor = ctx.ui.theme.constructor as new (
		fgColors: Record<string, string | number>,
		bgColors: Record<string, string | number>,
		mode: "truecolor" | "256color",
		options?: { name?: string; sourcePath?: string },
	) => Theme;
	const background = pickBackground(palette);
	const selectedBg = blendHex(background, palette.semantic.accent, palette.variant === "dark" ? 0.18 : 0.1);
	const userMessageBg = blendHex(background, palette.semantic.separator, palette.variant === "dark" ? 0.28 : 0.12);
	const customMessageBg = blendHex(background, palette.semantic.highlight, palette.variant === "dark" ? 0.18 : 0.1);
	const toolPendingBg = blendHex(background, palette.semantic.info, palette.variant === "dark" ? 0.12 : 0.08);
	const toolSuccessBg = blendHex(background, palette.semantic.success, palette.variant === "dark" ? 0.14 : 0.1);
	const toolErrorBg = blendHex(background, palette.semantic.error, palette.variant === "dark" ? 0.14 : 0.1);

	return new ThemeCtor(
		{
			accent: palette.semantic.accent,
			border: palette.semantic.border,
			borderAccent: palette.semantic.highlight,
			borderMuted: palette.semantic.separator,
			success: palette.semantic.success,
			error: palette.semantic.error,
			warning: palette.semantic.warning,
			muted: palette.semantic.muted,
			dim: palette.semantic.dim,
			text: palette.semantic.text,
			thinkingText: palette.semantic.muted,
			userMessageText: palette.semantic.text,
			customMessageText: palette.semantic.text,
			customMessageLabel: palette.semantic.label,
			toolTitle: palette.semantic.header,
			toolOutput: palette.semantic.value,
			mdHeading: palette.semantic.header,
			mdLink: palette.semantic.accent,
			mdLinkUrl: palette.semantic.muted,
			mdCode: palette.semantic.accent,
			mdCodeBlock: palette.semantic.text,
			mdCodeBlockBorder: palette.semantic.border,
			mdQuote: palette.semantic.muted,
			mdQuoteBorder: palette.semantic.border,
			mdHr: palette.semantic.separator,
			mdListBullet: palette.semantic.accent,
			toolDiffAdded: palette.semantic.success,
			toolDiffRemoved: palette.semantic.error,
			toolDiffContext: palette.semantic.muted,
			syntaxComment: palette.raw["comment"] ?? palette.semantic.muted,
			syntaxKeyword: palette.raw["blue"] ?? palette.semantic.accent,
			syntaxFunction: palette.raw["yellow"] ?? palette.semantic.header,
			syntaxVariable: palette.raw["cyan"] ?? palette.semantic.info,
			syntaxString: palette.raw["green"] ?? palette.semantic.success,
			syntaxNumber: palette.raw["orange"] ?? palette.semantic.warning,
			syntaxType: palette.raw["purple"] ?? palette.semantic.highlight,
			syntaxOperator: palette.semantic.text,
			syntaxPunctuation: palette.semantic.text,
			thinkingOff: palette.semantic.separator,
			thinkingMinimal: palette.semantic.muted,
			thinkingLow: palette.semantic.accent,
			thinkingMedium: palette.semantic.info,
			thinkingHigh: palette.semantic.highlight,
			thinkingXhigh: palette.semantic.error,
			bashMode: palette.semantic.success,
		},
		{
			selectedBg,
			userMessageBg,
			customMessageBg,
			toolPendingBg,
			toolSuccessBg,
			toolErrorBg,
		},
		"truecolor",
		{ name: palette.name },
	);
};

export const resolveThemeTarget = (
	ctx: ThemeSwitcherContext,
	name: string,
): string | Theme => {
	const installed = ctx.ui.getTheme?.(name);
	if (installed !== undefined) {
		return name;
	}
	return toPiTheme(ctx, getPalette(name));
};

export const applyTheme = (
	ctx: ThemeSwitcherContext,
	name: string,
	state: ThemeState,
	options?: { emitChangedEvent?: boolean },
): Effect.Effect<void, ThemeNotFoundError | ThemeLoadError> =>
	Effect.gen(function* () {
		syncThemeStateFromUi(state, ctx.ui.theme.name);

		const target = yield* Effect.try({
			try: () => resolveThemeTarget(ctx, name),
			catch: () => new ThemeNotFoundError({ name }),
		});

		const result = ctx.ui.setTheme(target);
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
