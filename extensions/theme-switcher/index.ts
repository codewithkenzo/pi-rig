import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadTheme } from "../../shared/theme/index.js";
import { registerThemeCommands } from "./src/commands.js";
import { registerThemeLifecycle } from "./src/lifecycle.js";
import { makeThemeState } from "./src/state.js";
import { makeThemeListTool, makeThemePreviewTool, makeThemeSetTool } from "./src/tools.js";

export default async function themeSwitcher(pi: ExtensionAPI): Promise<void> {
	const { palette } = loadTheme(process.cwd());
	const state = makeThemeState(palette.name);

	pi.registerTool(makeThemeSetTool(state));
	pi.registerTool(makeThemeListTool(state));
	pi.registerTool(makeThemePreviewTool(state));

	registerThemeCommands(pi, state);
	registerThemeLifecycle(pi, state);
}
