import { Cause } from "effect";
import { FlowCancelledError, SkillLoadError, SubprocessError } from "./types.js";

export function isFlowCancelledCause(cause: Cause.Cause<unknown>): boolean {
	for (const reason of cause.reasons) {
		if (!Cause.isFailReason(reason)) continue;
		if (reason.error instanceof FlowCancelledError) {
			return true;
		}
	}
	return false;
}

export function formatFlowError(cause: Cause.Cause<unknown>): string {
	for (const reason of cause.reasons) {
		if (!Cause.isFailReason(reason)) continue;
		const err = reason.error;
		if (err instanceof FlowCancelledError) {
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
