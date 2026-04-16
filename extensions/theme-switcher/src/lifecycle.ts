import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext, SessionStartEvent, Theme } from "@mariozechner/pi-coding-agent";
import { themeSkillDirExists, themeSkillPackageDir } from "./runtime.js";
import { findSavedThemeEntry, restoreThemeEntry, snapshotThemeEntry } from "./session.js";
import type { ThemeState } from "./state.js";
import { saveThemePreference, syncThemeStateFromUi } from "./state.js";
import { THEME_ENTRY_TYPE } from "./types.js";

type ThemeLifecycleRegistrationState = {
	resourcesDiscoverRegistered: boolean;
	sessionStartRegistered: boolean;
	agentEndRegistered: boolean;
	markResourcesDiscoverRegistered: () => void;
	markSessionStartRegistered: () => void;
	markAgentEndRegistered: () => void;
};

const readProjectThemeName = (cwd: string): string | undefined => {
	const file = path.join(cwd, ".pi", "theme.json");
	if (!fs.existsSync(file)) {
		return undefined;
	}

	try {
		const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			return undefined;
		}
		const active = (parsed as { active?: unknown }).active;
		if (typeof active !== "string") {
			return undefined;
		}
		const normalized = active.trim();
		return normalized.length > 0 ? normalized : undefined;
	} catch {
		return undefined;
	}
};

export const registerThemeLifecycle = (
	pi: ExtensionAPI,
	state: ThemeState,
	registrationState: ThemeLifecycleRegistrationState = {
		resourcesDiscoverRegistered: false,
		sessionStartRegistered: false,
		agentEndRegistered: false,
		markResourcesDiscoverRegistered: () => undefined,
		markSessionStartRegistered: () => undefined,
		markAgentEndRegistered: () => undefined,
	},
): void => {
	if (!registrationState.resourcesDiscoverRegistered) {
		pi.on("resources_discover", async () => {
			if (!themeSkillDirExists()) {
				return {};
			}

			return { skillPaths: [themeSkillPackageDir] };
		});
		registrationState.markResourcesDiscoverRegistered();
	}

	if (!registrationState.sessionStartRegistered) {
		pi.on("session_start", async (_event: SessionStartEvent, ctx: ExtensionContext) => {
			const projectThemeName = readProjectThemeName(ctx.cwd);
			const saved = findSavedThemeEntry(ctx.sessionManager.getEntries());
			const target =
				projectThemeName !== undefined
						? { active: projectThemeName }
				: (saved ?? { active: state.getActive() });
			if (target.active.trim() === "") {
				return;
			}
			if (ctx.ui.theme.name === target.active) {
				return;
			}

			const uiWithThemes = ctx.ui as ExtensionContext["ui"] & {
				getTheme?: (name: string) => Theme | undefined;
			};
			await restoreThemeEntry(
				{
					ui: {
						setTheme: (theme) => ctx.ui.setTheme(theme),
						getTheme: uiWithThemes.getTheme,
						theme: ctx.ui.theme,
					},
				},
				state,
				target,
			);
		});
		registrationState.markSessionStartRegistered();
	}

	if (!registrationState.agentEndRegistered) {
		pi.on("agent_end", async (_event, ctx: ExtensionContext) => {
			syncThemeStateFromUi(state, ctx.ui.theme.name);
			const active = state.getActive();
			if (readProjectThemeName(ctx.cwd) === undefined) {
				saveThemePreference(active);
			}
			pi.appendEntry(THEME_ENTRY_TYPE, snapshotThemeEntry(state));
		});
		registrationState.markAgentEndRegistered();
	}
};
