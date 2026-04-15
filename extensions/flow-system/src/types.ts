import { Type, type Static } from "@sinclair/typebox";
import { Data } from "effect";

export const ReasoningLevelSchema = Type.Union([
	Type.Literal("off"),
	Type.Literal("minimal"),
	Type.Literal("low"),
	Type.Literal("medium"),
	Type.Literal("high"),
	Type.Literal("xhigh"),
]);

export type ReasoningLevel = Static<typeof ReasoningLevelSchema>;

export const FlowProfileSchema = Type.Object({
	name: Type.String({ minLength: 1, maxLength: 64 }),
	description: Type.Optional(Type.String()),
	reasoning_level: ReasoningLevelSchema,
	// TODO: wire to pi CLI flag once upstream exposes a supported iteration-limit argument.
	// Currently validated and stored but not passed to the subprocess.
	max_iterations: Type.Number({ minimum: 1, maximum: 200 }),
	toolsets: Type.Array(Type.String()),
	skills: Type.Array(Type.String(), { maxItems: 32 }),
	system_prompt_prefix: Type.Optional(Type.String()),
});

export type FlowProfile = Static<typeof FlowProfileSchema>;

export const FlowJobStatusSchema = Type.Union([
	Type.Literal("pending"),
	Type.Literal("running"),
	Type.Literal("done"),
	Type.Literal("failed"),
	Type.Literal("cancelled"),
]);

export type FlowJobStatus = Static<typeof FlowJobStatusSchema>;

export const FlowJobSchema = Type.Object({
	id: Type.String(),
	profile: Type.String(),
	task: Type.String(),
	cwd: Type.Optional(Type.String()),
	status: FlowJobStatusSchema,
	createdAt: Type.Number(),
	startedAt: Type.Optional(Type.Number()),
	finishedAt: Type.Optional(Type.Number()),
	output: Type.Optional(Type.String()),
	error: Type.Optional(Type.String()),
	toolCount: Type.Optional(Type.Number({ minimum: 0 })),
	lastProgress: Type.Optional(Type.String()),
	lastAssistantText: Type.Optional(Type.String()),
});

export type FlowJob = Static<typeof FlowJobSchema>;

export const FlowQueueSchema = Type.Object({
	jobs: Type.Array(FlowJobSchema),
	mode: Type.Union([Type.Literal("sequential"), Type.Literal("parallel")]),
});

export type FlowQueue = Static<typeof FlowQueueSchema>;

export class ProfileNotFoundError extends Data.TaggedError("ProfileNotFoundError")<{
	readonly name: string;
}> {}

export class SkillLoadError extends Data.TaggedError("SkillLoadError")<{
	readonly path: string;
	readonly reason: string;
}> {}

export class SubprocessError extends Data.TaggedError("SubprocessError")<{
	readonly exitCode: number;
	readonly stderr: string;
}> {}

export class FlowCancelledError extends Data.TaggedError("FlowCancelledError")<{
	readonly reason: string;
}> {}

export class JobNotFoundError extends Data.TaggedError("JobNotFoundError")<{
	readonly id: string;
}> {}

export const FLOW_ENTRY_TYPE = "flow_system_state" as const;

export const FlowStateEntrySchema = Type.Object({
	jobs: Type.Array(FlowJobSchema),
});

export type FlowStateEntry = Static<typeof FlowStateEntrySchema>;
