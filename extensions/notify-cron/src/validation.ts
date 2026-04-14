import { Value } from "@sinclair/typebox/value";
import { DestinationSchema, formatDestinationTarget, parseDestinationTarget, type Destination } from "../../../shared/messaging/destination.js";
import { ExecutionEnvelopeSchema, type ExecutionEnvelope } from "./types.js";

export const validateEnvelope = (
	envelope: unknown,
): { ok: true; value: ExecutionEnvelope } | { ok: false; reason: string } => {
	if (!Value.Check(ExecutionEnvelopeSchema, envelope)) {
		return { ok: false, reason: "Invalid envelope schema." };
	}
	const parsed = envelope as ExecutionEnvelope;
	if (parsed.permissions.network === "limited") {
		const allowlist = parsed.permissions.networkAllowlist;
		if (allowlist === undefined || allowlist.length === 0) {
			return {
				ok: false,
				reason: "Invalid envelope: network=limited requires permissions.networkAllowlist.",
			};
		}
	}
	return { ok: true, value: parsed };
};

export const validateDestination = (
	destination: unknown,
): { ok: true; value: Destination } | { ok: false; reason: string } => {
	if (!Value.Check(DestinationSchema, destination)) {
		return { ok: false, reason: "Invalid destination schema." };
	}
	const parsed = destination as Destination;
	const compact = formatDestinationTarget(parsed);
	const reparsed = parseDestinationTarget(compact);
	if (reparsed === null) {
		return { ok: false, reason: "Invalid destination normalization." };
	}
	return { ok: true, value: reparsed };
};

