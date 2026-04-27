import { Cause } from "effect";
import { FlowCancelledError, SkillLoadError, SubprocessError } from "./types.js";

const readString = (value: unknown): value is string =>
	value !== undefined && typeof value === "string" && value.length > 0;

const isCancellationText = (value: string): boolean => /cancel|aborted/i.test(value);

const parseFlowCancelPayload = (value: string): unknown => {
	try {
		if (!value.includes("\"_tag\"")) {
			return undefined;
		}
		return JSON.parse(value);
	} catch {
		return undefined;
	}
};

const isFlowCancelledError = (value: unknown): value is FlowCancelledError => {
	if (value instanceof FlowCancelledError) {
		return true;
	}
	if (value !== null && typeof value === "object") {
		return (value as { _tag?: unknown })._tag === "FlowCancelledError";
	}
	return false;
};

const defaultFlowCancelReason = "Flow cancelled";

const isSubprocessErrorLike = (value: unknown): value is {
	readonly _tag?: unknown;
	readonly name?: unknown;
	readonly exitCode: number;
	readonly stderr: string;
} => {
	if (value === null || typeof value !== "object") {
		return false;
	}
	const candidate = value as { _tag?: unknown; name?: unknown; exitCode?: unknown; stderr?: unknown };
	return (
		(candidate._tag === "SubprocessError" || candidate.name === "SubprocessError") &&
		typeof candidate.exitCode === "number" &&
		typeof candidate.stderr === "string"
	);
};

const formatSubprocessError = (error: {
	readonly exitCode: number;
	readonly stderr: string;
	readonly signal?: unknown;
	readonly command?: unknown;
	readonly model?: unknown;
	readonly provider?: unknown;
	readonly profile?: unknown;
	readonly cwd?: unknown;
	readonly watchdogReason?: unknown;
	readonly lastJsonEvent?: unknown;
	readonly lastEvent?: unknown;
	readonly lastText?: unknown;
	readonly lastAssistantText?: unknown;
}): string => {
	const stderr = error.stderr.trim();
	if (stderr.length > 0) {
		return stderr;
	}
	const lines: string[] = ["[flow-system] child exited without stderr", `exitCode: ${error.exitCode}`];
	if (typeof error.signal === "string" && error.signal.length > 0) {
		lines.push(`signal: ${error.signal}`);
	}
	if (typeof error.profile === "string" && error.profile.length > 0) {
		lines.push(`profile: ${error.profile}`);
	}
	if (typeof error.model === "string" && error.model.length > 0) {
		lines.push(`model: ${error.model}`);
	}
	if (typeof error.provider === "string" && error.provider.length > 0) {
		lines.push(`provider: ${error.provider}`);
	}
	if (typeof error.cwd === "string" && error.cwd.length > 0) {
		lines.push(`cwd: ${error.cwd}`);
	}
	if (typeof error.command === "string" && error.command.length > 0) {
		lines.push(`command: ${error.command}`);
	}
	if (typeof error.watchdogReason === "string" && error.watchdogReason.length > 0) {
		lines.push(`watchdog: ${error.watchdogReason}`);
	}
	if (typeof error.lastJsonEvent === "string" && error.lastJsonEvent.length > 0) {
		lines.push(`last json event: ${error.lastJsonEvent}`);
	}
	if (typeof error.lastEvent === "string" && error.lastEvent.length > 0) {
		lines.push(`last event: ${error.lastEvent}`);
	}
	if (typeof error.lastText === "string" && error.lastText.length > 0) {
		lines.push(`last text: ${error.lastText}`);
	}
	if (typeof error.lastAssistantText === "string" && error.lastAssistantText.length > 0) {
		lines.push(`last assistant text: ${error.lastAssistantText}`);
	}
	const clipped = lines.join("\n");
	return clipped.length > 1800 ? `${clipped.slice(0, 1800)}…` : clipped;
};

const extractCancellationReason = (error: unknown): string | undefined => {
	if (isFlowCancelledError(error)) {
		if (readString(error.reason)) {
			return error.reason;
		}
		return defaultFlowCancelReason;
	}
	if (error instanceof Error && readString(error.message)) {
		const parsed = parseFlowCancelPayload(error.message);
		if (isFlowCancelledError(parsed)) {
			return extractCancellationReason(parsed);
		}
		if (isCancellationText(error.message)) {
			return error.message;
		}
		return undefined;
	}
	if (readString(error)) {
		if (isCancellationText(error)) {
			return error;
		}
		return undefined;
	}
	if (error === null || typeof error !== "object") {
		return undefined;
	}
	const candidate = error as { reason?: unknown; message?: unknown; name?: unknown };
	if (readString(candidate.reason) && isCancellationText(candidate.reason)) {
		return candidate.reason;
	}
	if (readString(candidate.message) && isCancellationText(candidate.message)) {
		return candidate.message;
	}
	if (readString(candidate.name) && isCancellationText(candidate.name)) {
		return candidate.name;
	}
	return undefined;
};

export function isFlowCancelledCause(cause: Cause.Cause<unknown>): boolean {
	return Cause.prettyErrors(cause).some(
		(error) => isFlowCancelledError(error) || extractCancellationReason(error) !== undefined,
	);
}

export function formatFlowError(cause: Cause.Cause<unknown>): string {
	for (const err of Cause.prettyErrors(cause)) {
		const cancellationReason = extractCancellationReason(err);
		if (cancellationReason !== undefined) {
			return cancellationReason;
		}
		if (err instanceof SubprocessError || isSubprocessErrorLike(err)) {
			return formatSubprocessError(err);
		}
		if (err instanceof SkillLoadError) {
			return `Failed to load skill "${err.path}": ${err.reason}`;
		}
	}
	return Cause.pretty(cause);
}
