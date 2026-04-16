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
		if (err instanceof SubprocessError) {
			const stderr = err.stderr.trim();
			return `Subprocess exited with code ${err.exitCode}${stderr ? `\n${stderr}` : ""}`;
		}
		if (err instanceof SkillLoadError) {
			return `Failed to load skill "${err.path}": ${err.reason}`;
		}
	}
	return Cause.pretty(cause);
}
