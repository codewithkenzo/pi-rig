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

export const ExecutionPreloadCommandSchema = Type.Object(
	{
		command: Type.String({ minLength: 1 }),
		optional: Type.Optional(Type.Boolean()),
		maxBytes: Type.Optional(Type.Integer({ minimum: 128, maximum: 8192 })),
	},
	{ additionalProperties: false },
);

export type ExecutionPreloadCommand = Static<typeof ExecutionPreloadCommandSchema>;

export const ExecutionPreloadSchema = Type.Object(
	{
		dirs: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { maxItems: 16 })),
		files: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { maxItems: 32 })),
		commands: Type.Optional(Type.Array(ExecutionPreloadCommandSchema, { maxItems: 16 })),
	},
	{ additionalProperties: false },
);

export type ExecutionPreload = Static<typeof ExecutionPreloadSchema>;

export const ExecutionEnvelopeSchema = Type.Object(
	{
		model: Type.Optional(Type.String({ minLength: 1 })),
		provider: Type.Optional(Type.String({ minLength: 1 })),
		reasoning: Type.Optional(ReasoningLevelSchema),
		effort: Type.Optional(ReasoningLevelSchema),
		maxIterations: Type.Optional(Type.Integer({ minimum: 1, maximum: 300 })),
		max_iterations: Type.Optional(Type.Integer({ minimum: 1, maximum: 300 })),
		maxToolCalls: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
		max_tool_calls: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
		maxRuntimeMs: Type.Optional(Type.Integer({ minimum: 1, maximum: 86_400_000 })),
		max_runtime_ms: Type.Optional(Type.Integer({ minimum: 1, maximum: 86_400_000 })),
		maxRuntimeSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 86_400 })),
		max_runtime_seconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 86_400 })),
		runtimeWarningMs: Type.Optional(Type.Integer({ minimum: 1, maximum: 86_400_000 })),
		runtime_warning_ms: Type.Optional(Type.Integer({ minimum: 1, maximum: 86_400_000 })),
		runtimeWarningSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 86_400 })),
		runtime_warning_seconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 86_400 })),
		preload: Type.Optional(ExecutionPreloadSchema),
	},
	{ additionalProperties: false },
);

export type ExecutionEnvelope = Static<typeof ExecutionEnvelopeSchema>;

export const ResolvedExecutionEnvelopeSchema = Type.Object(
	{
		model: Type.Optional(Type.String({ minLength: 1 })),
		provider: Type.Optional(Type.String({ minLength: 1 })),
		reasoning: ReasoningLevelSchema,
		effort: Type.Optional(ReasoningLevelSchema),
		requestedMaxIterations: Type.Optional(Type.Integer({ minimum: 1, maximum: 300 })),
		maxIterations: Type.Integer({ minimum: 1, maximum: 300 }),
		maxToolCalls: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
		maxRuntimeMs: Type.Optional(Type.Integer({ minimum: 1, maximum: 86_400_000 })),
		runtimeWarningMs: Type.Optional(Type.Integer({ minimum: 1, maximum: 86_400_000 })),
		preload: Type.Optional(ExecutionPreloadSchema),
		preloadDigest: Type.Optional(Type.String({ maxLength: 512 })),
	},
	{ additionalProperties: false },
);

export type ResolvedExecutionEnvelope = Static<typeof ResolvedExecutionEnvelopeSchema>;

export const FlowProfileSchema = Type.Object({
	name: Type.String({ minLength: 1, maxLength: 64 }),
	description: Type.Optional(Type.String()),
	reasoning_level: ReasoningLevelSchema,
	toolsets: Type.Array(Type.String()),
	skills: Type.Array(Type.String(), { maxItems: 32 }),
	model: Type.Optional(Type.String()),
	models: Type.Optional(Type.Array(Type.String(), { maxItems: 3 })),
	agent: Type.Optional(Type.String()),
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
	model: Type.Optional(Type.String()),
	agent: Type.Optional(Type.String()),
	envelope: Type.Optional(ResolvedExecutionEnvelopeSchema),
	status: FlowJobStatusSchema,
	createdAt: Type.Number(),
	startedAt: Type.Optional(Type.Number()),
	finishedAt: Type.Optional(Type.Number()),
	output: Type.Optional(Type.String()),
	error: Type.Optional(Type.String()),
	toolCount: Type.Optional(Type.Number({ minimum: 0 })),
	lastProgress: Type.Optional(Type.String()),
	lastAssistantText: Type.Optional(Type.String()),
	writingSummary: Type.Optional(Type.Boolean()),
	summaryPhaseSource: Type.Optional(Type.Union([Type.Literal("explicit"), Type.Literal("heuristic")])),
	recentTools: Type.Optional(Type.Array(Type.String(), { maxItems: 6 })),
});

export type FlowJob = Static<typeof FlowJobSchema>;

export const FlowQueueSchema = Type.Object({
	jobs: Type.Array(FlowJobSchema),
	mode: Type.Union([Type.Literal("sequential"), Type.Literal("parallel")]),
});

export type FlowQueue = Static<typeof FlowQueueSchema>;

export const FlowTeamTopologySchema = Type.Union([
	Type.Literal("fanout"),
	Type.Literal("chain"),
	Type.Literal("review-loop"),
	Type.Literal("debate"),
	Type.Literal("handoff"),
	Type.Literal("supervision"),
	Type.Literal("plan-approve"),
	Type.Literal("schema-fanout"),
]);

export type FlowTeamTopology = Static<typeof FlowTeamTopologySchema>;

export const FlowTeamRoleSchema = Type.Union([
	Type.Literal("coordinator"),
	Type.Literal("scout"),
	Type.Literal("planner"),
	Type.Literal("builder"),
	Type.Literal("reviewer"),
	Type.Literal("researcher"),
	Type.Literal("verifier"),
	Type.Literal("scribe"),
]);

export type FlowTeamRole = Static<typeof FlowTeamRoleSchema>;

export const FlowContextStateSchema = Type.Union([
	Type.Literal("none"),
	Type.Literal("fresh"),
	Type.Literal("preloaded"),
	Type.Literal("hooked"),
	Type.Literal("pending"),
	Type.Literal("stale"),
	Type.Literal("missing"),
	Type.Literal("error"),
]);

export type FlowContextState = Static<typeof FlowContextStateSchema>;

export const FlowBudgetPolicySchema = Type.Object(
	{
		maxToolCalls: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
		maxRuntimeMs: Type.Optional(Type.Integer({ minimum: 1, maximum: 86_400_000 })),
		runtimeWarningMs: Type.Optional(Type.Integer({ minimum: 1, maximum: 86_400_000 })),
		mode: Type.Optional(Type.Union([Type.Literal("advisory"), Type.Literal("soft-warning"), Type.Literal("hard-cap")])),
	},
	{ additionalProperties: false },
);

export type FlowBudgetPolicy = Static<typeof FlowBudgetPolicySchema>;

export const FlowVerificationPolicySchema = Type.Union([
	Type.Literal("none"),
	Type.Literal("per-agent-light"),
	Type.Literal("final-only"),
	Type.Literal("changed-scope"),
	Type.Literal("ci-handled"),
]);

export type FlowVerificationPolicy = Static<typeof FlowVerificationPolicySchema>;

export const FlowTeamAgentSchema = Type.Object(
	{
		jobId: Type.Optional(Type.String({ minLength: 1 })),
		role: FlowTeamRoleSchema,
		label: Type.String({ minLength: 1, maxLength: 80 }),
		profile: Type.String({ minLength: 1, maxLength: 64 }),
		phase: Type.String({ minLength: 1, maxLength: 80 }),
		contextState: FlowContextStateSchema,
		budget: Type.Optional(FlowBudgetPolicySchema),
	},
	{ additionalProperties: false },
);

export type FlowTeamAgent = Static<typeof FlowTeamAgentSchema>;

export const FlowTeamSessionSchema = Type.Object(
	{
		id: Type.String({ minLength: 1 }),
		title: Type.String({ minLength: 1, maxLength: 160 }),
		coordinator: Type.String({ minLength: 1, maxLength: 80 }),
		topology: FlowTeamTopologySchema,
		status: Type.Union([
			Type.Literal("planning"),
			Type.Literal("running"),
			Type.Literal("blocked"),
			Type.Literal("synthesizing"),
			Type.Literal("verifying"),
			Type.Literal("done"),
			Type.Literal("failed"),
			Type.Literal("cancelled"),
		]),
		jobIds: Type.Array(Type.String({ minLength: 1 }), { maxItems: 32 }),
		agents: Type.Array(FlowTeamAgentSchema, { maxItems: 16 }),
		contextState: FlowContextStateSchema,
		delegateMode: Type.Boolean(),
		qualityGates: Type.Array(Type.String({ minLength: 1, maxLength: 80 }), { maxItems: 16 }),
		verificationPolicy: FlowVerificationPolicySchema,
		createdAt: Type.Number(),
		updatedAt: Type.Number(),
	},
	{ additionalProperties: false },
);

export type FlowTeamSession = Static<typeof FlowTeamSessionSchema>;

export const FlowContextPacketKindSchema = Type.Union([
	Type.Literal("decision"),
	Type.Literal("constraint"),
	Type.Literal("finding"),
	Type.Literal("risk"),
	Type.Literal("artifact"),
	Type.Literal("test-result"),
	Type.Literal("handoff"),
	Type.Literal("blocker"),
	Type.Literal("correction"),
	Type.Literal("budget-warning"),
]);

export type FlowContextPacketKind = Static<typeof FlowContextPacketKindSchema>;

export const FlowContextTargetSchema = Type.Union([
	Type.Object({ type: Type.Literal("agent"), jobId: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
	Type.Object({ type: Type.Literal("role"), role: FlowTeamRoleSchema }, { additionalProperties: false }),
	Type.Object({ type: Type.Literal("team"), teamId: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
]);

export type FlowContextTarget = Static<typeof FlowContextTargetSchema>;

export const FlowContextPacketSchema = Type.Object(
	{
		id: Type.String({ minLength: 1 }),
		teamId: Type.String({ minLength: 1 }),
		ts: Type.Number(),
		kind: FlowContextPacketKindSchema,
		source: Type.Union([Type.Literal("coordinator"), Type.Literal("agent"), Type.Literal("hook"), Type.Literal("user"), Type.Literal("system")]),
		sourceJobId: Type.Optional(Type.String({ minLength: 1 })),
		target: FlowContextTargetSchema,
		priority: Type.Union([Type.Literal("low"), Type.Literal("normal"), Type.Literal("high"), Type.Literal("urgent")]),
		title: Type.String({ minLength: 1, maxLength: 120 }),
		summary: Type.String({ minLength: 1, maxLength: 512 }),
		body: Type.Optional(Type.String({ maxLength: 4_000 })),
		artifactPath: Type.Optional(Type.String({ maxLength: 512 })),
		tokenEstimate: Type.Optional(Type.Integer({ minimum: 0, maximum: 16_000 })),
		expiresAt: Type.Optional(Type.Number()),
		status: Type.Union([Type.Literal("proposed"), Type.Literal("accepted"), Type.Literal("injected"), Type.Literal("superseded"), Type.Literal("rejected")]),
	},
	{ additionalProperties: false },
);

export type FlowContextPacket = Static<typeof FlowContextPacketSchema>;

export const FlowArtifactRefSchema = Type.Object(
	{
		kind: Type.String({ minLength: 1, maxLength: 64 }),
		path: Type.Optional(Type.String({ maxLength: 512 })),
		digest: Type.Optional(Type.String({ maxLength: 160 })),
		summary: Type.String({ minLength: 1, maxLength: 512 }),
	},
	{ additionalProperties: false },
);

export type FlowArtifactRef = Static<typeof FlowArtifactRefSchema>;

export const FlowAgentHandoffSchema = Type.Object(
	{
		jobId: Type.String({ minLength: 1 }),
		role: FlowTeamRoleSchema,
		status: Type.Union([Type.Literal("done"), Type.Literal("blocked"), Type.Literal("failed"), Type.Literal("cancelled")]),
		objective: Type.String({ minLength: 1, maxLength: 512 }),
		keyFindings: Type.Array(Type.String({ minLength: 1, maxLength: 512 }), { maxItems: 16 }),
		decisionsProposed: Type.Array(Type.String({ minLength: 1, maxLength: 512 }), { maxItems: 12 }),
		filesRead: Type.Array(Type.String({ minLength: 1, maxLength: 256 }), { maxItems: 64 }),
		filesChanged: Type.Array(Type.String({ minLength: 1, maxLength: 256 }), { maxItems: 64 }),
		commandsRun: Type.Array(Type.String({ minLength: 1, maxLength: 256 }), { maxItems: 32 }),
		artifacts: Type.Array(FlowArtifactRefSchema, { maxItems: 32 }),
		risks: Type.Array(Type.String({ minLength: 1, maxLength: 512 }), { maxItems: 16 }),
		nextActions: Type.Array(Type.String({ minLength: 1, maxLength: 512 }), { maxItems: 16 }),
		tokenEfficientSummary: Type.String({ minLength: 1, maxLength: 1_200 }),
	},
	{ additionalProperties: false },
);

export type FlowAgentHandoff = Static<typeof FlowAgentHandoffSchema>;

export const FlowTeamSynthesisSchema = Type.Object(
	{
		teamId: Type.String({ minLength: 1 }),
		topology: FlowTeamTopologySchema,
		result: Type.Union([Type.Literal("ready"), Type.Literal("needs-review"), Type.Literal("blocked"), Type.Literal("failed")]),
		acceptedFacts: Type.Array(Type.String({ minLength: 1, maxLength: 512 }), { maxItems: 24 }),
		rejectedAssumptions: Type.Array(Type.String({ minLength: 1, maxLength: 512 }), { maxItems: 16 }),
		decisions: Type.Array(Type.String({ minLength: 1, maxLength: 512 }), { maxItems: 16 }),
		outstandingQuestions: Type.Array(Type.String({ minLength: 1, maxLength: 512 }), { maxItems: 16 }),
		agentHandoffs: Type.Array(FlowAgentHandoffSchema, { maxItems: 16 }),
		recommendedNextStep: Type.String({ minLength: 1, maxLength: 512 }),
	},
	{ additionalProperties: false },
);

export type FlowTeamSynthesis = Static<typeof FlowTeamSynthesisSchema>;

export const FlowHookDecisionSchema = Type.Object(
	{
		kind: Type.Union([
			Type.Literal("allow"),
			Type.Literal("block"),
			Type.Literal("warn"),
			Type.Literal("injectPacket"),
			Type.Literal("requireField"),
			Type.Literal("recommendTopology"),
			Type.Literal("setSkills"),
			Type.Literal("setVerificationPolicy"),
			Type.Literal("degrade"),
		]),
		message: Type.Optional(Type.String({ maxLength: 512 })),
		packet: Type.Optional(FlowContextPacketSchema),
		requiredField: Type.Optional(Type.String({ maxLength: 80 })),
		topology: Type.Optional(FlowTeamTopologySchema),
		skills: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 120 }), { maxItems: 32 })),
		verificationPolicy: Type.Optional(FlowVerificationPolicySchema),
	},
	{ additionalProperties: false },
);

export type FlowHookDecision = Static<typeof FlowHookDecisionSchema>;

export const FlowSystemConfigSchema = Type.Object({
	maxConcurrent: Type.Optional(Type.Integer({ minimum: 1, maximum: 64 })),
});

export type FlowSystemConfig = Static<typeof FlowSystemConfigSchema>;

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
