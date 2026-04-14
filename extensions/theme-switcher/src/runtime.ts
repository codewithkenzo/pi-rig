import { join } from "node:path";
import { existsSync } from "node:fs";
import {
	BUILTIN_PALETTES,
	PALETTE_MAP,
	createEngine,
	getPalette,
	pulse,
	renderPaletteList,
	renderPalettePreview,
	spin,
	spinnerFrames,
} from "../../../shared/theme/index.js";
import type { ThemeState } from "./state.js";

export const themeSkillDir = join(import.meta.dirname, "..", "skills");
export const themeSkillPackageDir = join(themeSkillDir, "theme-switcher");
export const themeSkillFile = join(themeSkillPackageDir, "SKILL.md");
export const themeSkillDirExists = (): boolean => existsSync(themeSkillFile);

export const getThemeNames = (): string[] =>
	Array.from(
		new Set([
			...BUILTIN_PALETTES.map((palette) => palette.name),
			...PALETTE_MAP.keys(),
		]),
	);

export const getResolvedThemeName = (
	state: ThemeState,
	uiThemeName: string | undefined,
): string => {
	if (uiThemeName !== undefined && uiThemeName !== state.getActive()) {
		state.setActive(uiThemeName);
	}

	return state.getActive();
};

export const renderThemeStatus = (activeTheme: string): string[] => {
	const theme = PALETTE_MAP.get(activeTheme);
	const names = getThemeNames();
	const index = names.indexOf(activeTheme);
	const next = names[(index + 1) % Math.max(names.length, 1)] ?? activeTheme;
	const state = { frame: 0, startedAt: Date.now() };
	const engine = theme !== undefined ? createEngine(theme, "truecolor") : undefined;
	const runningFrames = theme?.animations?.runningFrames ?? spinnerFrames.dots;
	const spinner = spin(runningFrames, state, 8);
	const livelyTitle =
		theme !== undefined
			? pulse(" Theme harness", theme.semantic.accent, state, 2.5)
			: "Theme harness";

	const lines = [
		`  ${spinner} ${livelyTitle}`,
		`  Active: ${activeTheme}`,
		`  Next:   ${next}`,
	];

	if (theme !== undefined) {
		lines.unshift(`  ${theme.name} (${theme.variant}, ${theme.source ?? "builtin"})`);
		if (theme.description) {
			lines.push(`  ${theme.description}`);
		}
	}

	lines.push("  /theme set <name> | /theme list | /theme preview <name> | /theme cycle");
	return lines;
};

export const renderThemeList = (activeTheme: string): string[] => renderPaletteList(activeTheme);

export const renderThemePreview = (themeName: string): string[] => {
	const palette = getPalette(themeName);
	return renderPalettePreview(palette);
};

export const buildThemeContextNote = (activeTheme: string): string => {
	const theme = PALETTE_MAP.get(activeTheme);
	const parts = [
		`[theme-switcher] active theme: ${activeTheme}`,
		theme !== undefined ? `(${theme.variant}, ${theme.source ?? "builtin"})` : "",
	];
	return parts.filter(Boolean).join(" ");
};
