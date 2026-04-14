import { Effect } from "effect";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { getPalette } from "../../../shared/theme/index.js";
import type { ThemeState } from "./state.js";
import { applyTheme, syncThemeStateFromUi } from "./state.js";
import { ThemeLoadError, ThemeNotFoundError } from "./types.js";
import { getThemeNames, renderThemeList, renderThemePreview, renderThemeStatus, getResolvedThemeName } from "./runtime.js";
import { setThemeUiStatus } from "./ui.js";

const HELP = "Usage: /theme status | set <name> | list | preview <name> | cycle";

const complete = (prefix: string): { label: string; value: string }[] => {
	const tokens = ["status", "set", "list", "preview", "cycle", ...getThemeNames()];
	return tokens
		.filter((token) => token.startsWith(prefix))
		.map((value) => ({ label: value, value }));
};

const notifyLines = async (ctx: ExtensionCommandContext, lines: string[]): Promise<void> => {
	await ctx.ui.notify(lines.join("\n"));
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

			const result = await Effect.runPromise(applyTheme(ctx, theme, state).pipe(Effect.result));
			if (result._tag === "Failure") {
				const error = result.failure;
				if (error instanceof ThemeNotFoundError) {
					await ctx.ui.notify(`Unknown theme: ${error.name}`);
					return;
				}
				if (error instanceof ThemeLoadError) {
					await ctx.ui.notify(`Theme set failed: ${error.reason}`);
					return;
				}
				await ctx.ui.notify(`Theme set failed: ${theme}`);
				return;
			}

			await ctx.ui.notify(`Active theme set to ${theme}.`);
			setThemeUiStatus(ctx.ui, state.getActive());
			return;
		}
		case "cycle": {
			const next = state.getNextName();
			const result = await Effect.runPromise(applyTheme(ctx, next, state).pipe(Effect.result));
			if (result._tag === "Failure") {
				const error = result.failure;
				if (error instanceof ThemeNotFoundError) {
					await ctx.ui.notify(`Unknown theme: ${error.name}`);
					return;
				}
				if (error instanceof ThemeLoadError) {
					await ctx.ui.notify(`Theme set failed: ${error.reason}`);
					return;
				}
				await ctx.ui.notify(`Theme set failed: ${next}`);
				return;
			}

			await ctx.ui.notify(`Cycled to ${next}.`);
			setThemeUiStatus(ctx.ui, state.getActive());
			return;
		}
		default:
			await ctx.ui.notify(HELP);
	}
};

export const registerThemeCommands = (pi: ExtensionAPI, state: ThemeState): void => {
	pi.registerCommand("theme", {
		description: "Manage the active theme. Subcommands: status, set, list, preview, cycle",
		getArgumentCompletions: (prefix: string) => complete(prefix),
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			syncThemeStateFromUi(state, ctx.ui.theme.name);
			await handleThemeCommand(args, ctx, state);
		},
	});
};
