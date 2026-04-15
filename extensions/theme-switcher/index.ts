import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadTheme } from "../../shared/theme/index.js";
import { registerThemeCommands } from "./src/commands.js";
import { registerThemeLifecycle } from "./src/lifecycle.js";
import { loadThemePreference, makeThemeState } from "./src/state.js";
import { makeThemeListTool, makeThemePreviewTool, makeThemeSetTool } from "./src/tools.js";

const initializedApis = new WeakSet<ExtensionAPI>();

export default async function themeSwitcher(pi: ExtensionAPI): Promise<void> {
	if (initializedApis.has(pi)) {
		console.warn("[theme-switcher] Extension already initialized for this API instance; skipping duplicate registration.");
		return;
	}
	initializedApis.add(pi);

	const { palette } = loadTheme(process.cwd());
	const preferred = loadThemePreference();
	const state = makeThemeState(preferred ?? palette.name);

	pi.registerTool(makeThemeSetTool(state));
	pi.registerTool(makeThemeListTool(state));
	pi.registerTool(makeThemePreviewTool(state));

	registerThemeCommands(pi, state);
	registerThemeLifecycle(pi, state);
}
