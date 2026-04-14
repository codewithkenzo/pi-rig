import type { ExtensionUIContext } from "@mariozechner/pi-coding-agent";
import { AnimationTicker, PALETTE_MAP, createEngine, getPalette, loadTheme, shimmer, spin, withMotion } from "../../../shared/theme/index.js";
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
const dim = (text: string): string => `\x1b[2m${text}\x1b[22m`;

const pad = (text: string, width: number): string =>
	text.length >= width ? text : `${text}${" ".repeat(width - text.length)}`;

const truncate = (text: string, width: number): string =>
	text.length <= width ? text : `${text.slice(0, Math.max(0, width - 1))}…`;

const renderPanel = (title: string, lines: readonly string[]): string[] => [
	`╭─ ${title}`,
	...lines.map((line) => `│ ${line}`),
	"╰─",
];

export const themeStatusText = (activeTheme: string): string =>
	`${activeTheme} · /theme set <name> · /theme cycle`;

export const setThemeUiStatus = (ui: ExtensionUIContext, activeTheme: string): void => {
	const setStatus = (ui as unknown as { setStatus?: (key: string, text: string | undefined) => void }).setStatus;
	if (typeof setStatus === "function") {
		setStatus(THEME_STATUS_KEY, themeStatusText(activeTheme));
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
): string[] => {
	const { config, palette: configuredPalette } = loadTheme(cwd);
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
		() => shimmer("theme switcher", palette.semantic.label, palette.semantic.accent, animationState, 3),
		engine.fg("label", "theme switcher"),
		reducedMotion,
	);
	const spinner = withMotion(
		() => spin(spinnerFrames, animationState, Math.max(4, config.animation.fps)),
		palette.animations?.doneSymbol ?? "•",
		reducedMotion,
	);

	const swatches = [
		`${engine.fg("accent", "●●")} accent`,
		`${engine.fg("success", "●●")} success`,
		`${engine.fg("warning", "●●")} warning`,
		`${engine.fg("error", "●●")} error`,
	].join("  ");

	return renderPanel(`${spinner} ${bold(title)}`, [
		`${pad(engine.fg("label", "Active"), 8)} ${engine.fg("accent", activeTheme)}`,
		`${pad(engine.fg("label", "Next"), 8)} ${engine.fg("value", nextTheme)}`,
		`${pad(engine.fg("label", "Mode"), 8)} ${engine.fg("value", `${palette.variant} · ${palette.source ?? "builtin"}`)}`,
		truncate(swatches, 72),
		dim("/theme set <name> · /theme preview <name> · /theme cycle"),
	]);
};

const makeLinesComponent = (getLines: () => string[]): LinesComponent => {
	let cachedLines = getLines();

	return {
		render: () => cachedLines,
		invalidate: () => {
			cachedLines = getLines();
		},
	};
};

export const createThemeWidgetFactory = (state: ThemeState, cwd: string) =>
	(tui: WidgetTui): LinesComponent => {
		const { config } = loadTheme(cwd);
		const ticker = new AnimationTicker();
		const component = makeLinesComponent(() => renderThemeWidgetLines(state, cwd, ticker.current));
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
	ui.setWidget(THEME_WIDGET_KEY, createThemeWidgetFactory(state, cwd), {
		placement: "belowEditor",
	});
	setThemeUiStatus(ui, state.getActive());
};

export const detachThemeUi = (ui: ExtensionUIContext): void => {
	ui.setWidget(THEME_WIDGET_KEY, undefined);
	clearThemeUiStatus(ui);
};
