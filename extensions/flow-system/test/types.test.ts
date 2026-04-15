import { describe, it, expect } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import {
	FlowProfileSchema,
	FlowJobStatusSchema,
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
