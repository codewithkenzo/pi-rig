import type { ExtensionUIContext } from "@mariozechner/pi-coding-agent";
import { AnimationTicker, PALETTE_MAP, createEngine, getPalette, loadTheme, shimmer, spin, withMotion } from "../../../shared/theme/index.js";
import type { Palette, ThemeConfig } from "../../../shared/theme/types.js";
import { ellipsize, fitAnsiLine, hintLine, joinCompact, metric, tag } from "../../../shared/ui/hud.js";
import { resolveThemeName, type ThemeState } from "./state.js";

const THEME_STATUS_KEY = "theme-switcher";
const THEME_WIDGET_KEY = "theme-switcher";

interface LinesComponent {
	render(width: number): string[];
	invalidate(): void;
	dispose?(): void;
}

interface WidgetTui {
	requestRender(force?: boolean): void;
}

const bold = (text: string): string => `\x1b[1m${text}\x1b[22m`;

export const themeStatusText = (activeTheme: string, nextTheme = activeTheme): string =>
	`theme ${activeTheme}${nextTheme !== activeTheme ? ` → ${nextTheme}` : ""} · /theme`;

export const setThemeUiStatus = (ui: ExtensionUIContext, activeTheme: string, nextTheme = activeTheme): void => {
	const setStatus = (ui as unknown as { setStatus?: (key: string, text: string | undefined) => void }).setStatus;
	if (typeof setStatus === "function") {
		setStatus(THEME_STATUS_KEY, themeStatusText(activeTheme, nextTheme));
	}
};

export const clearThemeUiStatus = (ui: ExtensionUIContext): void => {
	const setStatus = (ui as unknown as { setStatus?: (key: string, text: string | undefined) => void }).setStatus;
	if (typeof setStatus === "function") {
		setStatus(THEME_STATUS_KEY, undefined);
	}
};

export const renderThemeWidgetLines = (
	state: ThemeState,
	cwd: string,
	animationState = { frame: 0, startedAt: Date.now() },
	cachedThemeResult?: { config: ThemeConfig; palette: Palette },
): string[] => {
	const { config, palette: configuredPalette } = cachedThemeResult ?? loadTheme(cwd);
	let activeTheme = state.getActive();
	if (!PALETTE_MAP.has(activeTheme)) {
		const resolved = resolveThemeName(activeTheme, configuredPalette.name);
		activeTheme = PALETTE_MAP.has(resolved) ? resolved : configuredPalette.name;
		state.setActive(activeTheme);
	}
	const palette = getPalette(activeTheme);
	const engine = createEngine(palette, config.colorMode);
	const nextTheme = state.getNextName();
	const reducedMotion = !config.animation.enabled || config.animation.reducedMotion;
	const spinnerFrames = palette.animations?.runningFrames ?? ["◐", "◓", "◑", "◒"];
	const title = withMotion(
		() => shimmer("theme deck", palette.semantic.label, palette.semantic.accent, animationState, 3),
		engine.fg("label", "theme deck"),
		reducedMotion,
	);
	const spinner = withMotion(
		() => spin(spinnerFrames, animationState, Math.max(4, config.animation.fps)),
		palette.animations?.doneSymbol ?? "•",
		reducedMotion,
	);

	const swatches = joinCompact(engine, [
		metric(engine, "accent", "●", "accent"),
		metric(engine, "success", "●", "success"),
		metric(engine, "warning", "●", "warning"),
		metric(engine, "error", "●", "error"),
	]);

	return [
		`${spinner} ${bold(title)}${engine.fg("muted", " · ")}${tag(engine, "accent", activeTheme)} ${engine.fg("muted", "→")} ${tag(engine, "value", nextTheme)}`,
		joinCompact(engine, [
			tag(engine, palette.variant === "dark" ? "label" : "warning", palette.variant),
			tag(engine, "muted", palette.source ?? "unknown"),
			palette.description !== undefined ? engine.fg("muted", ellipsize(palette.description, 38)) : undefined,
		]),
		swatches,
		hintLine(engine, "/theme · /theme set <name> · /theme preview <name>"),
	];
};

const makeLinesComponent = (getLines: () => string[]): LinesComponent => {
	let cachedLines = getLines();

	return {
		render: (width: number) => cachedLines.map((line) => fitAnsiLine(line, width)),
		invalidate: () => {
			cachedLines = getLines();
		},
	};
};

export const createThemeWidgetFactory = (state: ThemeState, cwd: string) =>
	(tui: WidgetTui): LinesComponent => {
		const themeResult = loadTheme(cwd);
		const { config } = themeResult;
		const ticker = new AnimationTicker();
		const component = makeLinesComponent(() => renderThemeWidgetLines(state, cwd, ticker.current, themeResult));
		const shouldAnimate = config.animation.enabled && !config.animation.reducedMotion;

		if (shouldAnimate) {
			ticker.start(Math.max(4, config.animation.fps), () => {
				component.invalidate();
				tui.requestRender();
			});
		}

		return {
			...component,
			dispose: () => {
				ticker.stop();
			},
		};
	};

export const attachThemeUi = (
	ui: ExtensionUIContext,
	state: ThemeState,
	cwd: string,
): void => {
	ui.setWidget(THEME_WIDGET_KEY, createThemeWidgetFactory(state, cwd));
	setThemeUiStatus(ui, state.getActive(), state.getNextName());
};

export const detachThemeUi = (ui: ExtensionUIContext): void => {
	ui.setWidget(THEME_WIDGET_KEY, undefined);
	clearThemeUiStatus(ui);
};
