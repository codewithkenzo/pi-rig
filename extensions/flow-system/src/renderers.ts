import type { Theme } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { ellipsize } from "../../../shared/ui/hud.js";

export interface FlowRenderDetails {
	jobId?: string;
	profile?: string;
	background?: boolean;
	phase?: string;
	toolCount?: number;
	durationMs?: number;
	status?: "pending" | "running" | "done" | "failed" | "cancelled";
	summary?: string;
	successCount?: number;
	failCount?: number;
	cancelCount?: number;
	count?: number;
	parallel?: boolean;
	index?: number;
	envelopeIssues?: string[];
}

interface TextResultLike {
	content: Array<{ type: string; text?: string }>;
	details?: unknown;
	isError?: boolean;
}

const formatDuration = (ms: number): string => {
	if (ms < 1000) return `${ms}ms`;
	const seconds = Math.round(ms / 100) / 10;
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const rem = Math.round(seconds % 60);
	return `${minutes}m${rem}s`;
};

const resultText = (result: TextResultLike): string => {
	const first = result.content[0];
	return first?.type === "text" ? first.text ?? "" : "";
};

const summaryText = (result: TextResultLike, fallback = "(no output)"): string => {
	const details = result.details as FlowRenderDetails | undefined;
	if (details?.summary !== undefined && details.summary.trim().length > 0) {
		return ellipsize(details.summary, 84);
	}
	const text = resultText(result).trim();
	return text.length > 0 ? ellipsize(text, 84) : fallback;
};

const callPrefix = (theme: Theme, profile: string): string =>
	`${theme.fg("toolTitle", theme.bold("flow"))} ${theme.fg("accent", profile)}`;

export const renderFlowRunCall = (
	args: { profile: string; task: string; background?: boolean },
	theme: Theme,
): Text => {
	const mode = args.background ? theme.fg("warning", "bg") : theme.fg("muted", "fg");
	const task = theme.fg("toolOutput", `“${ellipsize(args.task, 68)}”`);
	return new Text(`${callPrefix(theme, args.profile)} ${theme.fg("muted", "→")} ${task} ${theme.fg("dim", mode)}`, 0, 0);
};

export const renderFlowRunResult = (
	result: TextResultLike,
	options: { isPartial?: boolean },
	theme: Theme,
): Text => {
	const details = result.details as FlowRenderDetails | undefined;
	const profile = details?.profile ?? "flow";
	if (options.isPartial || details?.phase !== undefined) {
		return new Text(
			`${theme.fg("warning", "◌")} ${theme.fg("accent", profile)} ${theme.fg("muted", summaryText(result, "working…"))}`,
			0,
			0,
		);
	}

	const cancelled = details?.status === "cancelled";
	const failed = !cancelled && (result.isError === true || details?.status === "failed");
	const statusIcon = cancelled
		? theme.fg("warning", "⊘")
		: failed
			? theme.fg("error", "✗")
			: theme.fg("success", "✓");
	const duration = details?.durationMs !== undefined ? theme.fg("muted", formatDuration(details.durationMs)) : "";
	const tools = details?.toolCount !== undefined ? theme.fg("muted", `${details.toolCount} tools`) : "";
	const mode = details?.background === true ? theme.fg("warning", "bg") : theme.fg("dim", "fg");
	const header = [
		statusIcon,
		theme.fg(cancelled ? "warning" : failed ? "error" : "accent", profile),
		duration,
		tools,
		theme.fg("dim", mode),
	]
		.filter(Boolean)
		.join(theme.fg("muted", " · "));
	return new Text(`${header}${theme.fg("muted", " — ")}${theme.fg("toolOutput", summaryText(result))}`, 0, 0);
};

export const renderFlowBatchCall = (
	args: { items: Array<{ profile: string }>; parallel?: boolean },
	theme: Theme,
): Text => {
	const count = args.items.length;
	const preview = args.items.slice(0, 3).map((item) => item.profile).join(", ");
	const mode = args.parallel ? theme.fg("warning", "parallel") : theme.fg("muted", "sequential");
	return new Text(
		`${theme.fg("toolTitle", theme.bold("flow batch"))} ${theme.fg("accent", `${count} jobs`)}${theme.fg("muted", " · ")}${theme.fg("toolOutput", preview)} ${theme.fg("dim", mode)}`,
		0,
		0,
	);
};

export const renderFlowBatchResult = (
	result: TextResultLike,
	options: { isPartial?: boolean },
	theme: Theme,
): Text => {
	const details = result.details as FlowRenderDetails | undefined;
	if (options.isPartial || details?.phase !== undefined) {
		return new Text(
			`${theme.fg("warning", "◌")} ${theme.fg("accent", "batch")} ${theme.fg("muted", summaryText(result, "running batch…"))}`,
			0,
			0,
		);
	}
	const count = details?.count ?? 0;
	const done = details?.successCount ?? 0;
	const fail = details?.failCount ?? 0;
	const cancelled = details?.cancelCount ?? 0;
	const hasFailures = fail > 0;
	const hasCancellations = cancelled > 0;
	const statusIcon = hasFailures
		? theme.fg("error", "✗")
		: hasCancellations
			? theme.fg("warning", "⊘")
			: theme.fg("success", "✓");
	const duration = details?.durationMs !== undefined ? theme.fg("muted", formatDuration(details.durationMs)) : "";
	const mode = details?.parallel === true ? theme.fg("warning", "parallel") : theme.fg("muted", "sequential");
	const header = [
		statusIcon,
		theme.fg(hasFailures ? "error" : hasCancellations ? "warning" : "accent", `batch ${count}`),
		theme.fg("muted", `${done} ok`),
		fail > 0 ? theme.fg("error", `${fail} fail`) : "",
		cancelled > 0 ? theme.fg("warning", `${cancelled} cancelled`) : "",
		duration,
		mode,
	]
		.filter(Boolean)
		.join(theme.fg("muted", " · "));
	return new Text(`${header}${theme.fg("muted", " — ")}${theme.fg("toolOutput", summaryText(result))}`, 0, 0);
};
