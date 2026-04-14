import type { Theme } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { ellipsize } from "../../../shared/ui/hud.js";

export interface ThemeRenderDetails {
	action?: "set" | "list" | "preview";
	theme?: string;
	active?: string;
	count?: number;
	phase?: string;
	status?: "done" | "failed";
	summary?: string;
}

interface TextResultLike {
	content: Array<{ type: string; text?: string }>;
	details?: unknown;
	isError?: boolean;
}

const textContent = (result: TextResultLike): string => {
	const first = result.content[0];
	return first?.type === "text" ? first.text ?? "" : "";
};

const summaryText = (result: TextResultLike, fallback: string): string => {
	const details = result.details as ThemeRenderDetails | undefined;
	if (details?.summary !== undefined && details.summary.trim().length > 0) {
		return ellipsize(details.summary, 84);
	}
	const text = textContent(result).trim();
	return text.length > 0 ? ellipsize(text, 84) : fallback;
};

export const renderThemeSetCall = (args: { theme: string }, theme: Theme): Text =>
	new Text(
		`${theme.fg("toolTitle", theme.bold("theme"))} ${theme.fg("accent", "set")}${theme.fg("muted", " → ")}${theme.fg("toolOutput", args.theme)}`,
		0,
		0,
	);

export const renderThemeListCall = (_args: Record<string, never>, theme: Theme): Text =>
	new Text(`${theme.fg("toolTitle", theme.bold("theme"))} ${theme.fg("accent", "list")}`, 0, 0);

export const renderThemePreviewCall = (args: { theme: string }, theme: Theme): Text =>
	new Text(
		`${theme.fg("toolTitle", theme.bold("theme"))} ${theme.fg("accent", "preview")}${theme.fg("muted", " → ")}${theme.fg("toolOutput", args.theme)}`,
		0,
		0,
	);

export const renderThemeToolResult = (
	result: TextResultLike,
	options: { isPartial?: boolean },
	theme: Theme,
): Text => {
	const details = result.details as ThemeRenderDetails | undefined;
	if (options.isPartial || details?.phase !== undefined) {
		const label = details?.theme ?? details?.active ?? "theme";
		return new Text(
			`${theme.fg("warning", "◌")} ${theme.fg("accent", label)} ${theme.fg("muted", summaryText(result, "updating theme…"))}`,
			0,
			0,
		);
	}

	const failed = result.isError === true || details?.status === "failed";
	const icon = failed ? theme.fg("error", "✗") : theme.fg("success", "✓");
	const action = details?.action ?? "theme";
	const primary = details?.theme ?? details?.active ?? action;
	const meta = [
		theme.fg(failed ? "error" : "accent", action),
		theme.fg("toolOutput", primary),
		details?.active !== undefined && details.active !== primary ? theme.fg("muted", `active ${details.active}`) : "",
		details?.count !== undefined ? theme.fg("muted", `${details.count} items`) : "",
	]
		.filter(Boolean)
		.join(theme.fg("muted", " · "));
	return new Text(`${icon} ${meta}${theme.fg("muted", " — ")}${theme.fg("toolOutput", summaryText(result, "theme updated"))}`, 0, 0);
};
