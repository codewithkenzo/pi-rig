import { describe, it, expect } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import {
	ExecutionEnvelopeSchema,
	ExecutionPreloadSchema,
	ResolvedExecutionEnvelopeSchema,
	FlowProfileSchema,
	FlowJobStatusSchema,
	FlowAgentHandoffSchema,
	FlowContextPacketSchema,
	FlowHookDecisionSchema,
	FlowTeamSessionSchema,
	FlowTeamSynthesisSchema,
	ProfileNotFoundError,
	SkillLoadError,
	SubprocessError,
	FlowCancelledError,
	JobNotFoundError,
} from "../src/types.js";
import type { FlowJobStatus } from "../src/types.js";

describe("FlowProfileSchema", () => {
	it("accepts a valid profile", () => {
		const valid = {
			name: "coder",
			reasoning_level: "medium",
			toolsets: ["code_execution"],
			skills: [],
		};
		expect(Value.Check(FlowProfileSchema, valid)).toBe(true);
	});

	it("accepts a valid profile with all optional fields", () => {
		const valid = {
			name: "debug",
			description: "Root-cause analysis",
			reasoning_level: "high",
			toolsets: [],
			skills: ["kenzo-effect-ts"],
			model: "gpt-5.3-codex",
			models: ["gpt-5.3-codex", "gpt-5.4", "claude-opus-4-6"],
			agent: "musashi",
			system_prompt_prefix: "You are a debugger.",
		};
		expect(Value.Check(FlowProfileSchema, valid)).toBe(true);
	});

	it("rejects a profile with empty name (minLength:1)", () => {
		const invalid = {
			name: "",
			reasoning_level: "low",
			toolsets: [],
			skills: [],
		};
		expect(Value.Check(FlowProfileSchema, invalid)).toBe(false);
	});

	it("rejects a profile with name exceeding maxLength:64", () => {
		const invalid = {
			name: "a".repeat(65),
			reasoning_level: "low",
			toolsets: [],
			skills: [],
		};
		expect(Value.Check(FlowProfileSchema, invalid)).toBe(false);
	});

	it("rejects a profile with invalid reasoning_level", () => {
		const invalid = {
			name: "explore",
			reasoning_level: "extreme",
			toolsets: [],
			skills: [],
		};
		expect(Value.Check(FlowProfileSchema, invalid)).toBe(false);
	});

	it("accepts profiles with extra compatibility fields (normalized later in loadProfiles)", () => {
		const compatible = {
			name: "explore",
			reasoning_level: "low",
			toolsets: [],
			skills: [],
			max_iterations: 12,
		};
		expect(Value.Check(FlowProfileSchema, compatible)).toBe(true);
	});

	it("rejects models arrays above maxItems:3", () => {
		const invalid = {
			name: "research",
			reasoning_level: "medium",
			toolsets: ["web"],
			skills: [],
			models: ["a", "b", "c", "d"],
		};
		expect(Value.Check(FlowProfileSchema, invalid)).toBe(false);
	});
});

describe("FlowJobStatusSchema", () => {
	const ALL_STATUSES: FlowJobStatus[] = ["pending", "running", "done", "failed", "cancelled"];

	it("covers all 5 status values", () => {
		expect(ALL_STATUSES).toHaveLength(5);
	});

	it("accepts each valid status", () => {
		for (const status of ALL_STATUSES) {
			expect(Value.Check(FlowJobStatusSchema, status)).toBe(true);
		}
	});

	it("rejects an unknown status", () => {
		expect(Value.Check(FlowJobStatusSchema, "queued")).toBe(false);
	});
});

describe("Execution envelope schemas", () => {
	it("accepts preload packet with dirs/files/commands", () => {
		expect(
			Value.Check(ExecutionPreloadSchema, {
				dirs: ["src"],
				files: ["README.md"],
				commands: [{ command: "git status --short", optional: true, maxBytes: 512 }],
			}),
		).toBe(true);
	});

	it("accepts execution envelope override payload", () => {
		expect(
			Value.Check(ExecutionEnvelopeSchema, {
				model: "gpt-5.4",
				provider: "openai",
				reasoning: "high",
				effort: "high",
				maxIterations: 42,
				maxToolCalls: 80,
				runtimeWarningSeconds: 600,
				maxRuntimeSeconds: 900,
				preload: { dirs: ["."] },
			}),
		).toBe(true);
	});

	it("accepts resolved envelope with requestedMaxIterations and digest", () => {
		expect(
			Value.Check(ResolvedExecutionEnvelopeSchema, {
				reasoning: "medium",
				maxIterations: 32,
				requestedMaxIterations: 60,
				maxToolCalls: 80,
				runtimeWarningMs: 600_000,
				maxRuntimeMs: 900_000,
				model: "claude-sonnet-4-6",
				provider: "anthropic",
				preloadDigest: "dirs:1, commands:2",
			}),
		).toBe(true);
	});
});

describe("team orchestration schemas", () => {
	const handoff = {
		jobId: "job-1",
		role: "builder",
		status: "done",
		objective: "Implement endpoint",
		keyFindings: ["Route exists"],
		decisionsProposed: ["Keep response envelope"],
		filesRead: ["src/routes/items.ts"],
		filesChanged: ["src/routes/items.ts"],
		commandsRun: ["bun test"],
		artifacts: [{ kind: "diff", path: "artifacts/diff.patch", summary: "Endpoint patch" }],
		risks: ["Needs review"],
		nextActions: ["Run final verification"],
		tokenEfficientSummary: "Endpoint implemented; review pending.",
	};

	it("accepts team session state", () => {
		expect(
			Value.Check(FlowTeamSessionSchema, {
				id: "team-1",
				title: "Add item API",
				coordinator: "main",
				topology: "review-loop",
				status: "running",
				jobIds: ["job-1"],
				agents: [
					{
						jobId: "job-1",
						role: "builder",
						label: "api-writer",
						profile: "coder",
						phase: "implement",
						contextState: "fresh",
						budget: { maxToolCalls: 80, runtimeWarningMs: 600_000, mode: "soft-warning" },
					},
				],
				contextState: "fresh",
				delegateMode: true,
				qualityGates: ["final-check"],
				verificationPolicy: "final-only",
				createdAt: 1,
				updatedAt: 2,
			}),
		).toBe(true);
	});

	it("accepts context packet and hook decision state", () => {
		const packet = {
			id: "pkt-1",
			teamId: "team-1",
			ts: 1,
			kind: "constraint",
			source: "coordinator",
			target: { type: "role", role: "builder" },
			priority: "high",
			title: "API contract v2",
			summary: "Keep response envelope stable.",
			tokenEstimate: 64,
			status: "accepted",
		};

		expect(Value.Check(FlowContextPacketSchema, packet)).toBe(true);
		expect(Value.Check(FlowHookDecisionSchema, { kind: "injectPacket", packet })).toBe(true);
	});

	it("accepts handoff and team synthesis outputs", () => {
		expect(Value.Check(FlowAgentHandoffSchema, handoff)).toBe(true);
		expect(
			Value.Check(FlowTeamSynthesisSchema, {
				teamId: "team-1",
				topology: "review-loop",
				result: "needs-review",
				acceptedFacts: ["Route exists"],
				rejectedAssumptions: [],
				decisions: ["Keep response envelope"],
				outstandingQuestions: ["Reviewer verdict"],
				agentHandoffs: [handoff],
				recommendedNextStep: "Run final verification.",
			}),
		).toBe(true);
	});
});

describe("Tagged errors", () => {
	it("ProfileNotFoundError is instanceof ProfileNotFoundError", () => {
		const err = new ProfileNotFoundError({ name: "x" });
		expect(err).toBeInstanceOf(ProfileNotFoundError);
		expect(err._tag).toBe("ProfileNotFoundError");
		expect(err.name).toBe("x");
	});

	it("SkillLoadError carries path and reason", () => {
		const err = new SkillLoadError({ path: "/skills/foo.md", reason: "ENOENT" });
		expect(err).toBeInstanceOf(SkillLoadError);
		expect(err._tag).toBe("SkillLoadError");
		expect(err.path).toBe("/skills/foo.md");
		expect(err.reason).toBe("ENOENT");
	});

	it("SubprocessError carries exitCode and stderr", () => {
		const err = new SubprocessError({ exitCode: 1, stderr: "command not found" });
		expect(err).toBeInstanceOf(SubprocessError);
		expect(err._tag).toBe("SubprocessError");
		expect(err.exitCode).toBe(1);
		expect(err.stderr).toBe("command not found");
	});

	it("FlowCancelledError carries a reason", () => {
		const err = new FlowCancelledError({ reason: "Flow cancelled." });
		expect(err).toBeInstanceOf(FlowCancelledError);
		expect(err._tag).toBe("FlowCancelledError");
		expect(err.reason).toBe("Flow cancelled.");
	});

	it("JobNotFoundError carries id", () => {
		const err = new JobNotFoundError({ id: "job-abc-123" });
		expect(err).toBeInstanceOf(JobNotFoundError);
		expect(err._tag).toBe("JobNotFoundError");
		expect(err.id).toBe("job-abc-123");
	});

	it("error instances are distinct classes", () => {
		const profile = new ProfileNotFoundError({ name: "x" });
		const job = new JobNotFoundError({ id: "y" });
		expect(profile).not.toBeInstanceOf(JobNotFoundError);
		expect(job).not.toBeInstanceOf(ProfileNotFoundError);
	});
});
