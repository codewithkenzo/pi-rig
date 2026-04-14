import type { ExtensionAPI, ExtensionContext, SessionStartEvent } from "@mariozechner/pi-coding-agent";
import { themeSkillDirExists, themeSkillPackageDir } from "./runtime.js";
import { findSavedThemeEntry, restoreThemeEntry, snapshotThemeEntry } from "./session.js";
import type { ThemeState } from "./state.js";
import { syncThemeStateFromUi } from "./state.js";
import { THEME_ENTRY_TYPE } from "./types.js";

export const registerThemeLifecycle = (pi: ExtensionAPI, state: ThemeState): void => {
	pi.on("resources_discover", async () => {
		if (!themeSkillDirExists()) {
			return {};
		}

		return { skillPaths: [themeSkillPackageDir] };
	});

	pi.on("session_start", async (_event: SessionStartEvent, ctx: ExtensionContext) => {
		const saved = findSavedThemeEntry(ctx.sessionManager.getEntries());
		if (saved === undefined) {
			return;
		}

		await restoreThemeEntry(
			{
				ui: {
					setTheme: (theme: string) => ctx.ui.setTheme(theme),
					theme: ctx.ui.theme,
				},
			},
			state,
			saved,
		);
	});

	pi.on("agent_end", async (_event, ctx: ExtensionContext) => {
		syncThemeStateFromUi(state, ctx.ui.theme.name);
		pi.appendEntry(THEME_ENTRY_TYPE, snapshotThemeEntry(state));
	});
};
