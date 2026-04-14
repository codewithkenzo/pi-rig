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
import {
	renderThemeListCall,
	renderThemePreviewCall,
	renderThemeSetCall,
	renderThemeToolResult,
	type ThemeRenderDetails,
} from "./renderers.js";

const textResult = (text: string, isError = false, details?: ThemeRenderDetails): AgentToolResult<unknown> => ({
	content: [{ type: "text" as const, text }],
	details,
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

const summarize = (text: string): string => {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length === 0) {
		return "(no output)";
	}
	return normalized.length > 160 ? `${normalized.slice(0, 160)}…` : normalized;
};

export const makeThemeSetTool = (state: ThemeState) => ({
	name: "theme_set",
	label: "Set Theme",
	description: "Set the active UI theme by name.",
	parameters: ThemeSetParamsSchema,
	renderCall: (
		args: Parameters<typeof renderThemeSetCall>[0],
		theme: Parameters<typeof renderThemeSetCall>[1],
	) => renderThemeSetCall(args, theme),
	renderResult: (
		result: Parameters<typeof renderThemeToolResult>[0],
		options: Parameters<typeof renderThemeToolResult>[1],
		theme: Parameters<typeof renderThemeToolResult>[2],
	) => renderThemeToolResult(result, options, theme),
	execute: async (
		_toolCallId: string,
		params: { theme: string },
		signal: AbortSignal | undefined,
		onUpdate: AgentToolUpdateCallback<unknown> | undefined,
		ctx: ExtensionContext,
	) => {
		if (signal?.aborted) {
			return textResult(`Theme change cancelled before applying "${params.theme}".`, true, {
				action: "set",
				theme: params.theme,
				status: "failed",
				summary: "theme change cancelled before apply",
			});
		}
		emitUpdate(onUpdate, `Applying theme "${params.theme}"…`, {
			theme: params.theme,
			phase: "applying",
			action: "set",
		} satisfies ThemeRenderDetails);
		const exit = await Effect.runPromiseExit(applyTheme(ctx, params.theme, state));

		if (Exit.isFailure(exit)) {
			const error = getFailureError(exit.cause);
			const message = error instanceof ThemeNotFoundError
				? `Unknown theme "${error.name}".`
				: error instanceof ThemeLoadError
					? `Failed to load theme "${params.theme}": ${error.reason}`
					: `Failed to set theme "${params.theme}"`;
			return textResult(message, true, {
				action: "set",
				theme: params.theme,
				status: "failed",
				summary: summarize(message),
			});
		}

		return {
			content: [{ type: "text" as const, text: `Active theme set to ${params.theme}.` }],
			details: {
				action: "set",
				theme: params.theme,
				active: state.getActive(),
				status: "done",
				summary: `theme set to ${params.theme}`,
			} satisfies ThemeRenderDetails,
		};
	},
} as const);

export const makeThemeListTool = (state: ThemeState) => ({
	name: "theme_list",
	label: "List Themes",
	description: "List available themes and highlight the active one.",
	parameters: ThemeListParamsSchema,
	renderCall: (
		args: Parameters<typeof renderThemeListCall>[0],
		theme: Parameters<typeof renderThemeListCall>[1],
	) => renderThemeListCall(args, theme),
	renderResult: (
		result: Parameters<typeof renderThemeToolResult>[0],
		options: Parameters<typeof renderThemeToolResult>[1],
		theme: Parameters<typeof renderThemeToolResult>[2],
	) => renderThemeToolResult(result, options, theme),
	execute: async (
		_toolCallId: string,
		_params: Record<string, never>,
		signal: AbortSignal | undefined,
		onUpdate: AgentToolUpdateCallback<unknown> | undefined,
		ctx: ExtensionContext,
	) => {
		if (signal?.aborted) {
			return textResult("Theme list cancelled.", true, {
				action: "list",
				status: "failed",
				summary: "theme list cancelled",
			});
		}
		const active = syncThemeStateFromUi(state, ctx.ui.theme.name);
		emitUpdate(onUpdate, `Listing themes (active: ${active})…`, {
			active,
			phase: "listing",
			action: "list",
		} satisfies ThemeRenderDetails);
		const rendered = renderThemeList(active).join("\n");
		return {
			content: [{ type: "text" as const, text: rendered }],
			details: {
				action: "list",
				active,
				count: rendered.split("\n").filter((line) => line.trim().length > 0).length,
				status: "done",
				summary: `listed themes for ${active}`,
			} satisfies ThemeRenderDetails,
		};
	},
} as const);

export const makeThemePreviewTool = (state: ThemeState) => ({
	name: "theme_preview",
	label: "Preview Theme",
	description: "Render a preview of a theme without switching to it.",
	parameters: ThemePreviewParamsSchema,
	renderCall: (
		args: Parameters<typeof renderThemePreviewCall>[0],
		theme: Parameters<typeof renderThemePreviewCall>[1],
	) => renderThemePreviewCall(args, theme),
	renderResult: (
		result: Parameters<typeof renderThemeToolResult>[0],
		options: Parameters<typeof renderThemeToolResult>[1],
		theme: Parameters<typeof renderThemeToolResult>[2],
	) => renderThemeToolResult(result, options, theme),
	execute: async (
		_toolCallId: string,
		params: { theme: string },
		signal: AbortSignal | undefined,
		onUpdate: AgentToolUpdateCallback<unknown> | undefined,
		ctx: ExtensionContext,
	) => {
		if (signal?.aborted) {
			return textResult(`Theme preview cancelled for "${params.theme}".`, true, {
				action: "preview",
				theme: params.theme,
				status: "failed",
				summary: "theme preview cancelled",
			});
		}
		const active = syncThemeStateFromUi(state, ctx.ui.theme.name);
		emitUpdate(onUpdate, `Previewing theme "${params.theme}"…`, {
			theme: params.theme,
			active,
			phase: "preview",
			action: "preview",
		} satisfies ThemeRenderDetails);
		try {
			getPalette(params.theme);
		} catch {
			return textResult(`Unknown theme "${params.theme}".`, true, {
				action: "preview",
				theme: params.theme,
				active,
				status: "failed",
				summary: `unknown theme ${params.theme}`,
			});
		}

		try {
			const lines = renderThemePreview(params.theme);
			return {
				content: [{ type: "text" as const, text: lines.join("\n") }],
				details: {
					action: "preview",
					theme: params.theme,
					active,
					status: "done",
					summary: `previewed ${params.theme}`,
				} satisfies ThemeRenderDetails,
			};
		} catch {
			return textResult(`Theme preview failed for "${params.theme}".`, true, {
				action: "preview",
				theme: params.theme,
				active,
				status: "failed",
				summary: `preview failed for ${params.theme}`,
			});
		}
	},
} as const);
