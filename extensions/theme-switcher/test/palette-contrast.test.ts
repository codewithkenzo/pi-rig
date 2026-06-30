import { describe, expect, it } from "bun:test";
import { BUILTIN_PALETTES } from "../../../shared/theme/palette.js";
import type { Palette } from "../../../shared/theme/types.js";
import { contrastRatio, deriveReadableThemeTextColors } from "../src/state.js";

const hexToRgb = (hex: string): [number, number, number] => {
	const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
	const value = Number.parseInt(normalized, 16);
	return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

const rgbToHex = (r: number, g: number, b: number): string =>
	`#${[r, g, b]
		.map((value) =>
			Math.max(0, Math.min(255, Math.round(value)))
				.toString(16)
				.padStart(2, "0"),
		)
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

const generatedBackgrounds = (palette: Palette): readonly string[] => {
	const background = pickBackground(palette);
	return [
		background,
		blendHex(
			background,
			palette.semantic.accent,
			palette.variant === "dark" ? 0.18 : 0.1,
		),
		blendHex(
			background,
			palette.semantic.separator,
			palette.variant === "dark" ? 0.28 : 0.12,
		),
		blendHex(
			background,
			palette.semantic.highlight,
			palette.variant === "dark" ? 0.18 : 0.1,
		),
		blendHex(
			background,
			palette.semantic.info,
			palette.variant === "dark" ? 0.12 : 0.08,
		),
		blendHex(
			background,
			palette.semantic.success,
			palette.variant === "dark" ? 0.14 : 0.1,
		),
		blendHex(
			background,
			palette.semantic.error,
			palette.variant === "dark" ? 0.14 : 0.1,
		),
	] as const;
};

describe("theme-switcher readable text contrast", () => {
	it("keeps muted/dim Pi text fields readable across every built-in palette", () => {
		for (const palette of BUILTIN_PALETTES) {
			const backgrounds = generatedBackgrounds(palette);
			const readable = deriveReadableThemeTextColors(palette, backgrounds);
			const fieldChecks: Array<[string, string, number]> = [
				["muted", readable.muted, 4.5],
				["thinkingText", readable.muted, 4.5],
				["mdLinkUrl", readable.muted, 4.5],
				["mdQuote", readable.muted, 4.5],
				["toolDiffContext", readable.muted, 4.5],
				["thinkingMinimal", readable.muted, 4.5],
				["syntaxComment", readable.syntaxComment, 4.5],
				["dim", readable.dim, 3.5],
			];

			for (const [field, foreground, minimum] of fieldChecks) {
				for (const background of backgrounds) {
					expect(
						contrastRatio(foreground, background),
						`${palette.name} ${field} on ${background}`,
					).toBeGreaterThanOrEqual(minimum);
				}
			}
		}
	});

	it("keeps Hyrule identity colors while relying on global muted text lifting", () => {
		const hyrule = BUILTIN_PALETTES.find(
			(palette) => palette.name === "hyrule",
		);
		expect(hyrule).toBeDefined();
		if (hyrule === undefined) {
			return;
		}

		expect(hyrule.semantic.accent).toBe("#8CCCCE");
		expect(hyrule.semantic.highlight).toBe("#86CBD3");
		expect(hyrule.raw["background"]).toBe("#111820");
	});
});
