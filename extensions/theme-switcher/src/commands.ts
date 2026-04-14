import { Effect } from "effect";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { getPalette } from "../../../shared/theme/index.js";
import type { ThemeState } from "./state.js";
import { applyTheme, syncThemeStateFromUi } from "./state.js";
import { ThemeLoadError, ThemeNotFoundError } from "./types.js";
import { getThemeNames, renderThemeList, renderThemePreview, renderThemeStatus, getResolvedThemeName } from "./runtime.js";
import { attachThemeUi, setThemeUiStatus } from "./ui.js";

const HELP = "Usage: /theme status | set <name> | list | preview <name> | pick | cycle";
type ThemeUiContext = Pick<ExtensionCommandContext, "cwd" | "ui">;

const complete = (prefix: string): { label: string; value: string }[] => {
	const tokens = ["status", "set", "list", "preview", "pick", "cycle", ...getThemeNames()];
	return tokens
		.filter((token) => token.startsWith(prefix))
		.map((value) => ({ label: value, value }));
};

const notifyLines = async (ctx: ExtensionCommandContext, lines: string[]): Promise<void> => {
	await ctx.ui.notify(lines.join("\n"));
};

const applyAndRefreshTheme = async (
	theme: string,
	ctx: ThemeUiContext,
	state: ThemeState,
): Promise<{ ok: true } | { ok: false; message: string }> => {
	const result = await Effect.runPromise(applyTheme(ctx, theme, state).pipe(Effect.result));
	if (result._tag === "Failure") {
		const error = result.failure;
		if (error instanceof ThemeNotFoundError) {
			return { ok: false, message: `Unknown theme: ${error.name}` };
		}
		if (error instanceof ThemeLoadError) {
			return { ok: false, message: `Theme set failed: ${error.reason}` };
		}
		return { ok: false, message: `Theme set failed: ${theme}` };
	}

	attachThemeUi(ctx.ui, state, ctx.cwd);
	setThemeUiStatus(ctx.ui, state.getActive());
	return { ok: true };
};

const runThemePick = async (ctx: ThemeUiContext, state: ThemeState): Promise<void> => {
	const options = getThemeNames();
	if (options.length === 0) {
		await ctx.ui.notify("No themes available.");
		return;
	}

	const picked = await ctx.ui.select("Pick a theme", options);
	if (picked === undefined) {
		await ctx.ui.notify("Theme selection cancelled.");
		return;
	}

	const applied = await applyAndRefreshTheme(picked, ctx, state);
	if (!applied.ok) {
		await ctx.ui.notify(applied.message);
		return;
	}

	await ctx.ui.notify(`Active theme set to ${state.getActive()}.`);
};

const runThemeCycle = async (ctx: ThemeUiContext, state: ThemeState): Promise<void> => {
	const next = state.getNextName();
	const applied = await applyAndRefreshTheme(next, ctx, state);
	if (!applied.ok) {
		await ctx.ui.notify(applied.message);
		return;
	}

	await ctx.ui.notify(`Cycled to ${state.getActive()}.`);
};

export const handleThemeCommand = async (
	args: string,
	ctx: ExtensionCommandContext,
	state: ThemeState,
): Promise<void> => {
	const parts = args.trim().split(/\s+/).filter(Boolean);
	const sub = parts[0] ?? "status";
	const current = getResolvedThemeName(state, ctx.ui.theme.name);

	switch (sub) {
		case "status":
			setThemeUiStatus(ctx.ui, current);
			await notifyLines(ctx, renderThemeStatus(current));
			return;
		case "list":
			await notifyLines(ctx, renderThemeList(current));
			return;
		case "preview": {
			const theme = parts.slice(1).join(" ");
			if (theme === "") {
				await ctx.ui.notify(HELP);
				return;
			}

			try {
				getPalette(theme);
			} catch {
				await ctx.ui.notify(`Unknown theme: ${theme}`);
				return;
			}

			try {
				await notifyLines(ctx, renderThemePreview(theme));
			} catch {
				await ctx.ui.notify(`Theme preview failed: ${theme}`);
			}
			return;
		}
		case "set": {
			const theme = parts.slice(1).join(" ");
			if (theme === "") {
				await ctx.ui.notify(HELP);
				return;
			}

			const applied = await applyAndRefreshTheme(theme, ctx, state);
			if (!applied.ok) {
				await ctx.ui.notify(applied.message);
				return;
			}

			await ctx.ui.notify(`Active theme set to ${state.getActive()}.`);
			return;
		}
		case "pick": {
			await runThemePick(ctx, state);
			return;
		}
		case "cycle": {
			await runThemeCycle(ctx, state);
			return;
		}
		default:
			await ctx.ui.notify(HELP);
	}
};

export const registerThemeCommands = (pi: ExtensionAPI, state: ThemeState): void => {
	pi.registerCommand("theme", {
		description: "Manage the active theme. Subcommands: status, set, list, preview, pick, cycle",
		getArgumentCompletions: (prefix: string) => complete(prefix),
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			syncThemeStateFromUi(state, ctx.ui.theme.name);
			await handleThemeCommand(args, ctx, state);
		},
	});

	pi.registerShortcut("alt+shift+t", {
		description: "Open theme picker",
		handler: async (ctx) => {
			syncThemeStateFromUi(state, ctx.ui.theme.name);
			await runThemePick(ctx, state);
		},
	});

	pi.registerShortcut("alt+shift+y", {
		description: "Cycle theme",
		handler: async (ctx) => {
			syncThemeStateFromUi(state, ctx.ui.theme.name);
			await runThemeCycle(ctx, state);
		},
	});
};
