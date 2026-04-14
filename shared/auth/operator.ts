export interface OperatorAuthPolicy {
	readonly allowedActorIds: readonly string[];
	readonly accessToken: string | undefined;
}

export interface OperatorAuthResult {
	readonly ok: boolean;
	readonly reason?: "unauthorized" | "missing_actor" | "missing_token";
}

const normalizeCsv = (value: string | undefined): readonly string[] => {
	if (value === undefined) return [];
	const unique = new Set(
		value
			.split(",")
			.map((entry) => entry.trim())
			.filter((entry) => entry.length > 0),
	);
	return Array.from(unique);
};

const mergeAllowedActors = (
	envAllowed: readonly string[],
	extraAllowed: readonly string[] | undefined,
): readonly string[] => {
	if (extraAllowed === undefined || extraAllowed.length === 0) return envAllowed;
	const merged = new Set(envAllowed);
	for (const actor of extraAllowed) {
		const trimmed = actor.trim();
		if (trimmed.length > 0) merged.add(trimmed);
	}
	return Array.from(merged);
};

export const loadOperatorAuthPolicy = (
	prefix: string,
	extraAllowed: readonly string[] | undefined = undefined,
): OperatorAuthPolicy => {
	const allowedActorIds = normalizeCsv(process.env[`${prefix}_ALLOWED_ACTOR_IDS`]);
	const accessToken = process.env[`${prefix}_ACCESS_TOKEN`]?.trim() || undefined;
	return {
		allowedActorIds: mergeAllowedActors(allowedActorIds, extraAllowed),
		accessToken,
	};
};

export const isOperatorAuthEnabled = (policy: OperatorAuthPolicy): boolean =>
	policy.allowedActorIds.length > 0 || policy.accessToken !== undefined;

export const authorizeOperator = (
	policy: OperatorAuthPolicy,
	actorId: string | undefined,
	actorToken: string | undefined,
): OperatorAuthResult => {
	if (!isOperatorAuthEnabled(policy)) return { ok: true };

	const tokenMatches =
		policy.accessToken !== undefined &&
		actorToken !== undefined &&
		actorToken.length > 0 &&
		actorToken === policy.accessToken;
	if (tokenMatches) return { ok: true };

	if (policy.allowedActorIds.length > 0) {
		if (actorId === undefined || actorId.trim().length === 0) return { ok: false, reason: "missing_actor" };
		if (!policy.allowedActorIds.includes(actorId)) return { ok: false, reason: "unauthorized" };
		return { ok: true };
	}

	return { ok: false, reason: "missing_token" };
};
