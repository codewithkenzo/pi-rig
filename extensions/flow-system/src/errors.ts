import { Cause } from "effect";
import { FlowCancelledError, SkillLoadError, SubprocessError } from "./types.js";

const isFlowCancelledError = (value: unknown): value is FlowCancelledError => {
	if (value instanceof FlowCancelledError) {
		return true;
	}
	if (
		value !== null &&
		typeof value === "object" &&
		"_tag" in value &&
		(value as { _tag: unknown })._tag === "FlowCancelledError"
	) {
		return true;
	}
	if (value instanceof Error && value.name === "FlowCancelledError") {
		return true;
	}
	if (typeof value === "string") {
		return value.includes("FlowCancelledError");
	}
	return false;
};

export function isFlowCancelledCause(cause: Cause.Cause<unknown>): boolean {
	return Cause.prettyErrors(cause).some((error) => isFlowCancelledError(error));
}

export function formatFlowError(cause: Cause.Cause<unknown>): string {
	for (const err of Cause.prettyErrors(cause)) {
		if (isFlowCancelledError(err)) {
			return err.reason;
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
