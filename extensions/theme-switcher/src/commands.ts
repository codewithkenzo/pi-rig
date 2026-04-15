import { Effect } from "effect";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { getPalette, PALETTE_MAP, createEngine } from "../../../shared/theme/index.js";
import type { ThemeState } from "./state.js";
import { applyTheme, syncThemeStateFromUi } from "./state.js";
import { ThemeLoadError, ThemeNotFoundError } from "./types.js";
import { getThemeNames, renderThemeList, renderThemePreview, renderThemeStatus, getResolvedThemeName } from "./runtime.js";
import { showThemePicker } from "./picker.js";

const HELP = "Usage: /theme | /theme set <name> | /theme list | /theme preview <name> | /theme status | /theme cycle";
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

const applyThemeDirectly = async (
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
	return { ok: true };
};

const runThemePick = async (ctx: ThemeUiContext, state: ThemeState): Promise<void> => {
	const active = syncThemeStateFromUi(state, ctx.ui.theme.name);
	const options = getThemeNames();
	if (options.length === 0) {
		await ctx.ui.notify("No themes available.");
		return;
	}

	const picked = await showThemePicker(ctx, active);
	if (picked === undefined) {
		await ctx.ui.notify("Theme selection cancelled.");
		return;
	}

	if (ctx.ui.theme.name !== picked) {
		const applied = await applyThemeDirectly(picked, ctx, state);
		if (!applied.ok) {
			await ctx.ui.notify(applied.message);
			return;
		}
	} else {
		state.setActive(picked);
	}

	const activeName = state.getActive();
	const palette = PALETTE_MAP.get(activeName);
	const engine = palette ? createEngine(palette, "truecolor") : undefined;
	const label = engine
		? `${engine.fg("success", "✓")} Theme set to ${engine.fg("accent", activeName)}`
		: `✓ Theme set to ${activeName}`;
	await ctx.ui.notify(label);
};

const runThemeCycle = async (ctx: ThemeUiContext, state: ThemeState): Promise<void> => {
	const prev = state.getActive();
	const next = state.getNextName();
	const applied = await applyThemeDirectly(next, ctx, state);
	if (!applied.ok) {
		await ctx.ui.notify(applied.message);
		return;
	}

	const nextPalette = PALETTE_MAP.get(state.getActive());
	const nextEngine = nextPalette ? createEngine(nextPalette, "truecolor") : undefined;
	const msg = nextEngine
		? `${nextEngine.fg("success", "✓")} ${nextEngine.fg("muted", prev)} → ${nextEngine.fg("accent", state.getActive())}`
		: `✓ ${prev} → ${state.getActive()}`;
	await ctx.ui.notify(msg);
};

export const handleThemeCommand = async (
	args: string,
	ctx: ExtensionCommandContext,
	state: ThemeState,
): Promise<void> => {
	const parts = args.trim().split(/\s+/).filter(Boolean);
	const sub = parts[0] ?? "pick";
	const current = getResolvedThemeName(state, ctx.ui.theme.name);

	switch (sub) {
		case "pick":
			await runThemePick(ctx, state);
			return;
		case "status":
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

			const applied = await applyThemeDirectly(theme, ctx, state);
			if (!applied.ok) {
				await ctx.ui.notify(applied.message);
				return;
			}

			const activeName = state.getActive();
			const palette = PALETTE_MAP.get(activeName);
			const engine = palette ? createEngine(palette, "truecolor") : undefined;
			const label = engine
				? `${engine.fg("success", "✓")} Theme set to ${engine.fg("accent", activeName)}`
				: `✓ Theme set to ${activeName}`;
			await ctx.ui.notify(label);
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
		description: "Open the theme picker or manage the active theme.",
		getArgumentCompletions: (prefix: string) => complete(prefix),
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			syncThemeStateFromUi(state, ctx.ui.theme.name);
			await handleThemeCommand(args, ctx, state);
		},
	});
};
