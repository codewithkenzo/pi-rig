import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadTheme } from "../../shared/theme/index.js";
import { registerThemeCommands } from "./src/commands.js";
import { registerThemeLifecycle } from "./src/lifecycle.js";
import { loadThemePreference, makeThemeState, type ThemeState } from "./src/state.js";
import { makeThemeListTool, makeThemePreviewTool, makeThemeSetTool } from "./src/tools.js";

interface ThemeSwitcherInitState {
	themeState: ThemeState | undefined;
	toolSetRegistered: boolean;
	toolListRegistered: boolean;
	toolPreviewRegistered: boolean;
	commandsRegistered: boolean;
	lifecycleRegistered: boolean;
	initialized: boolean;
}

const states = new WeakMap<ExtensionAPI, ThemeSwitcherInitState>();

const createState = (): ThemeSwitcherInitState => ({
	themeState: undefined,
	toolSetRegistered: false,
	toolListRegistered: false,
	toolPreviewRegistered: false,
	commandsRegistered: false,
	lifecycleRegistered: false,
	initialized: false,
});

export default async function themeSwitcher(pi: ExtensionAPI): Promise<void> {
	const state = states.get(pi) ?? createState();

	if (state.initialized) {
		console.warn("[theme-switcher] Extension already initialized for this API instance; skipping duplicate registration.");
		return;
	}
	try {
		if (state.themeState === undefined) {
			const { palette } = loadTheme(process.cwd());
			const preferred = loadThemePreference();
			state.themeState = makeThemeState(preferred ?? palette.name);
		}
		const themeState = state.themeState;

		if (!state.toolSetRegistered) {
			pi.registerTool(makeThemeSetTool(themeState));
			state.toolSetRegistered = true;
		}
		if (!state.toolListRegistered) {
			pi.registerTool(makeThemeListTool(themeState));
			state.toolListRegistered = true;
		}
		if (!state.toolPreviewRegistered) {
			pi.registerTool(makeThemePreviewTool(themeState));
			state.toolPreviewRegistered = true;
		}
		if (!state.commandsRegistered) {
			registerThemeCommands(pi, themeState);
			state.commandsRegistered = true;
		}
		if (!state.lifecycleRegistered) {
			registerThemeLifecycle(pi, themeState);
			state.lifecycleRegistered = true;
		}

		state.initialized = true;
		states.set(pi, state);
	} catch (error) {
		states.set(pi, state);
		throw error;
	}
}
