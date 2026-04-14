import { describe, expect, it } from "bun:test";
import { authorizeOperator, isOperatorAuthEnabled, loadOperatorAuthPolicy } from "../auth/operator.js";

describe("operator auth policy", () => {
	it("is disabled when env policy is empty", () => {
		delete process.env.PI_GATEWAY_ALLOWED_ACTOR_IDS;
		delete process.env.PI_GATEWAY_ACCESS_TOKEN;
		const policy = loadOperatorAuthPolicy("PI_GATEWAY");
		expect(isOperatorAuthEnabled(policy)).toBe(false);
		expect(authorizeOperator(policy, undefined, undefined)).toEqual({ ok: true });
	});

	it("authorizes allowlisted actors", () => {
		process.env.PI_GATEWAY_ALLOWED_ACTOR_IDS = "u1,u2";
		delete process.env.PI_GATEWAY_ACCESS_TOKEN;
		const policy = loadOperatorAuthPolicy("PI_GATEWAY");
		expect(authorizeOperator(policy, "u1", undefined)).toEqual({ ok: true });
		expect(authorizeOperator(policy, "u3", undefined)).toEqual({ ok: false, reason: "unauthorized" });
		expect(authorizeOperator(policy, undefined, undefined)).toEqual({ ok: false, reason: "missing_actor" });
	});

	it("authorizes token when configured", () => {
		delete process.env.PI_NOTIFY_CRON_ALLOWED_ACTOR_IDS;
		process.env.PI_NOTIFY_CRON_ACCESS_TOKEN = "secret-token";
		const policy = loadOperatorAuthPolicy("PI_NOTIFY_CRON");
		expect(authorizeOperator(policy, undefined, "secret-token")).toEqual({ ok: true });
		expect(authorizeOperator(policy, undefined, undefined)).toEqual({ ok: false, reason: "missing_token" });
	});
});
