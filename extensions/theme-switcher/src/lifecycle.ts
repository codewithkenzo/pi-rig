import type { ExtensionAPI, ExtensionContext, SessionStartEvent } from "@mariozechner/pi-coding-agent";
import { buildThemeContextNote, themeSkillDirExists, themeSkillPackageDir } from "./runtime.js";
import { findSavedThemeEntry, restoreThemeEntry, snapshotThemeEntry } from "./session.js";
import type { ThemeState } from "./state.js";
import { syncThemeStateFromUi } from "./state.js";
import { THEME_ENTRY_TYPE } from "./types.js";
import { attachThemeUi, detachThemeUi, setThemeUiStatus } from "./ui.js";

const makeContextMessage = (themeName: string) => ({
	role: "user" as const,
	content: `[theme-switcher] ${buildThemeContextNote(themeName)}. Use /theme set, /theme preview, /theme list, or /theme cycle when you need to adjust it.`,
	timestamp: Date.now(),
});

export const registerThemeLifecycle = (pi: ExtensionAPI, state: ThemeState): void => {
	pi.on("resources_discover", async () => {
		if (!themeSkillDirExists()) {
			return {};
		}

		return { skillPaths: [themeSkillPackageDir] };
	});

	pi.on("context", async (_event, ctx: ExtensionContext) => {
		const active = syncThemeStateFromUi(state, ctx.ui.theme.name);
		return { messages: [makeContextMessage(active)] };
	});

	pi.on("session_start", async (_event: SessionStartEvent, ctx: ExtensionContext) => {
		const saved = findSavedThemeEntry(ctx.sessionManager.getEntries());
		if (saved === undefined) {
			if (ctx.hasUI) {
				attachThemeUi(ctx.ui, state, ctx.cwd);
			}
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
		if (ctx.hasUI) {
			attachThemeUi(ctx.ui, state, ctx.cwd);
		}
		setThemeUiStatus(ctx.ui, state.getActive());
	});

	pi.on("agent_end", async (_event, ctx: ExtensionContext) => {
		syncThemeStateFromUi(state, ctx.ui.theme.name);
		if (ctx.hasUI) {
			setThemeUiStatus(ctx.ui, state.getActive());
		}
		pi.appendEntry(THEME_ENTRY_TYPE, snapshotThemeEntry(state));
	});

	pi.on("session_shutdown", async (_event, ctx: ExtensionContext) => {
		if (ctx.hasUI) {
			detachThemeUi(ctx.ui);
		}
	});
};
