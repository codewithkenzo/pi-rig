import { Type, type Static } from "@sinclair/typebox";
import { DestinationSchema } from "../../../shared/messaging/destination.js";

export const ReasoningSchema = Type.Union([
	Type.Literal("off"),
	Type.Literal("low"),
	Type.Literal("medium"),
	Type.Literal("high"),
]);

export const PermissionSchema = Type.Object({
	fileRead: Type.Array(Type.String()),
	fileWrite: Type.Array(Type.String()),
	network: Type.Union([Type.Literal("off"), Type.Literal("limited"), Type.Literal("on")]),
	networkAllowlist: Type.Optional(Type.Array(Type.String())),
});

export const PreloadSchema = Type.Object({
	dirs: Type.Optional(Type.Array(Type.String())),
	files: Type.Optional(Type.Array(Type.String())),
	commands: Type.Optional(Type.Array(Type.String())),
});

export const ExecutionEnvelopeSchema = Type.Object({
	model: Type.String({ minLength: 1 }),
	reasoning: ReasoningSchema,
	maxIterations: Type.Number({ minimum: 1, maximum: 500 }),
	preload: PreloadSchema,
	skills: Type.Array(Type.String()),
	toolsets: Type.Array(Type.String()),
	permissions: PermissionSchema,
});

export type ExecutionEnvelope = Static<typeof ExecutionEnvelopeSchema>;

export const NotifyCronJobSchema = Type.Object({
	id: Type.String({ minLength: 1, maxLength: 128 }),
	title: Type.String({ minLength: 1, maxLength: 200 }),
	everyMinutes: Type.Number({ minimum: 1, maximum: 24 * 60 }),
	destination: DestinationSchema,
	enabled: Type.Boolean(),
	envelope: ExecutionEnvelopeSchema,
	message: Type.String({ minLength: 1, maxLength: 4000 }),
});

export type NotifyCronJob = Static<typeof NotifyCronJobSchema>;

export interface NotifyCronJobState {
	readonly job: NotifyCronJob;
	lastScheduledAt: number | undefined;
	lastAttemptAt: number | undefined;
	lastSuccessAt: number | undefined;
}

export interface NotifyCronLease {
	owner: string;
	expiresAt: number;
}

export interface NotifyCronRun {
	jobId: string;
	scheduledAt: number;
	idempotencyKey: string;
	destination: NotifyCronJob["destination"];
	message: string;
	envelope: NotifyCronJob["envelope"];
}
