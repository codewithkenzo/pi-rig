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
	resourcesDiscoverRegistered: boolean;
	sessionStartRegistered: boolean;
	agentEndRegistered: boolean;
	initialized: boolean;
}

const states = new WeakMap<ExtensionAPI, ThemeSwitcherInitState>();

const createState = (): ThemeSwitcherInitState => ({
	themeState: undefined,
	toolSetRegistered: false,
	toolListRegistered: false,
	toolPreviewRegistered: false,
	commandsRegistered: false,
	resourcesDiscoverRegistered: false,
	sessionStartRegistered: false,
	agentEndRegistered: false,
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
		if (!state.resourcesDiscoverRegistered || !state.sessionStartRegistered || !state.agentEndRegistered) {
			registerThemeLifecycle(pi, themeState, {
				resourcesDiscoverRegistered: state.resourcesDiscoverRegistered,
				sessionStartRegistered: state.sessionStartRegistered,
				agentEndRegistered: state.agentEndRegistered,
				markResourcesDiscoverRegistered: () => {
					state.resourcesDiscoverRegistered = true;
				},
				markSessionStartRegistered: () => {
					state.sessionStartRegistered = true;
				},
				markAgentEndRegistered: () => {
					state.agentEndRegistered = true;
				},
			});
		}

		state.initialized = true;
		states.set(pi, state);
	} catch (error) {
		states.set(pi, state);
		throw error;
	}
}
