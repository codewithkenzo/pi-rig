import { Cause, Effect, Exit } from "effect";
import type { AgentToolResult, AgentToolUpdateCallback, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getPalette } from "../../../shared/theme/index.js";
import {
	ThemeListParamsSchema,
	ThemeLoadError,
	ThemeNotFoundError,
	ThemePreviewParamsSchema,
	ThemeSetParamsSchema,
} from "./types.js";
import { applyTheme, syncThemeStateFromUi, type ThemeState } from "./state.js";
import { renderThemeList, renderThemePreview } from "./runtime.js";
import { setThemeUiStatus } from "./ui.js";

const textResult = (text: string, isError = false): AgentToolResult<unknown> => ({
	content: [{ type: "text" as const, text }],
	details: undefined,
	...(isError ? { isError: true } : {}),
});

const emitUpdate = (
	onUpdate: AgentToolUpdateCallback<unknown> | undefined,
	text: string,
	details?: Record<string, unknown>,
): void => {
	onUpdate?.({
		content: [{ type: "text", text }],
		details,
	});
};

const getFailureError = (cause: Cause.Cause<unknown>): unknown => {
	for (const reason of cause.reasons) {
		if (Cause.isFailReason(reason)) return reason.error;
	}
	return undefined;
};

export const makeThemeSetTool = (state: ThemeState) => ({
	name: "theme_set",
	label: "Set Theme",
	description: "Set the active UI theme by name.",
	parameters: ThemeSetParamsSchema,
	execute: async (
		_toolCallId: string,
		params: { theme: string },
		signal: AbortSignal | undefined,
		onUpdate: AgentToolUpdateCallback<unknown> | undefined,
		ctx: ExtensionContext,
	) => {
		if (signal?.aborted) {
			return textResult(`Theme change cancelled before applying "${params.theme}".`, true);
		}
		emitUpdate(onUpdate, `Applying theme "${params.theme}"…`, {
			theme: params.theme,
			phase: "applying",
		});
		const exit = await Effect.runPromiseExit(applyTheme(ctx, params.theme, state));

		if (Exit.isFailure(exit)) {
			const error = getFailureError(exit.cause);
			const message = error instanceof ThemeNotFoundError
				? `Unknown theme "${error.name}".`
				: error instanceof ThemeLoadError
					? `Failed to load theme "${params.theme}": ${error.reason}`
					: `Failed to set theme "${params.theme}"`;
			return textResult(message, true);
		}

		setThemeUiStatus(ctx.ui, state.getActive());
		return {
			content: [{ type: "text" as const, text: `Active theme set to ${params.theme}.` }],
			details: { theme: params.theme },
		};
	},
} as const);

export const makeThemeListTool = (state: ThemeState) => ({
	name: "theme_list",
	label: "List Themes",
	description: "List available themes and highlight the active one.",
	parameters: ThemeListParamsSchema,
	execute: async (
		_toolCallId: string,
		_params: Record<string, never>,
		signal: AbortSignal | undefined,
		onUpdate: AgentToolUpdateCallback<unknown> | undefined,
		ctx: ExtensionContext,
	) => {
		if (signal?.aborted) {
			return textResult("Theme list cancelled.", true);
		}
		const active = syncThemeStateFromUi(state, ctx.ui.theme.name);
		emitUpdate(onUpdate, `Listing themes (active: ${active})…`, {
			active,
			phase: "listing",
		});
		setThemeUiStatus(ctx.ui, active);
		return {
			content: [{ type: "text" as const, text: renderThemeList(active).join("\n") }],
			details: { active },
		};
	},
} as const);

export const makeThemePreviewTool = (state: ThemeState) => ({
	name: "theme_preview",
	label: "Preview Theme",
	description: "Render a preview of a theme without switching to it.",
	parameters: ThemePreviewParamsSchema,
	execute: async (
		_toolCallId: string,
		params: { theme: string },
		signal: AbortSignal | undefined,
		onUpdate: AgentToolUpdateCallback<unknown> | undefined,
		ctx: ExtensionContext,
	) => {
		if (signal?.aborted) {
			return textResult(`Theme preview cancelled for "${params.theme}".`, true);
		}
		const active = syncThemeStateFromUi(state, ctx.ui.theme.name);
		setThemeUiStatus(ctx.ui, active);
		emitUpdate(onUpdate, `Previewing theme "${params.theme}"…`, {
			theme: params.theme,
			active,
			phase: "preview",
		});
		try {
			getPalette(params.theme);
		} catch {
			return textResult(`Unknown theme "${params.theme}".`, true);
		}

		try {
			const lines = renderThemePreview(params.theme);
			return {
				content: [{ type: "text" as const, text: lines.join("\n") }],
				details: { theme: params.theme, active },
			};
		} catch {
			return textResult(`Theme preview failed for "${params.theme}".`, true);
		}
	},
} as const);
