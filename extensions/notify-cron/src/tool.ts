import { Type } from "@sinclair/typebox";
import type { NotifyCronScheduler } from "./scheduler.js";
import { parseDestinationTarget } from "../../../shared/messaging/destination.js";
import { ExecutionEnvelopeSchema, type NotifyCronJob } from "./types.js";
import { authorizeOperator, loadOperatorAuthPolicy } from "../../../shared/auth/operator.js";
import { validateDestination, validateEnvelope } from "./validation.js";

const defaultEnvelope = {
	model: "claude-sonnet-4-6",
	reasoning: "medium",
	maxIterations: 20,
	preload: {},
	skills: [],
	toolsets: [],
	permissions: {
		fileRead: [],
		fileWrite: [],
		network: "off",
	},
} as const;

const toolTextResult = (text: string, isError = false) =>
	isError
		? { content: [{ type: "text" as const, text }], isError: true, details: undefined }
		: { content: [{ type: "text" as const, text }], details: undefined };

const authorizeNotifyCronOperator = (
	actorId: string | undefined,
	actorToken: string | undefined,
	allowedActorIds: readonly string[] | undefined,
) => {
	const policy = loadOperatorAuthPolicy("PI_NOTIFY_CRON", allowedActorIds);
	return authorizeOperator(policy, actorId, actorToken);
};

export const makeNotifyCronUpsertTool = (scheduler: NotifyCronScheduler) =>
	({
		name: "notify_cron_upsert",
		label: "Notify cron upsert",
		description: "Create or update a destination-safe cron notification job",
		parameters: Type.Object({
			id: Type.String({ minLength: 1, maxLength: 128 }),
			title: Type.String({ minLength: 1, maxLength: 200 }),
			every_minutes: Type.Number({ minimum: 1, maximum: 24 * 60 }),
			destination: Type.String({ minLength: 1 }),
			message: Type.String({ minLength: 1, maxLength: 4000 }),
			enabled: Type.Optional(Type.Boolean({ default: true })),
			envelope: Type.Optional(ExecutionEnvelopeSchema),
			actor_id: Type.Optional(Type.String({ minLength: 1 })),
			actor_token: Type.Optional(Type.String({ minLength: 1 })),
			allowed_actor_ids: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
		}),
		execute: async (
			_toolCallId: string,
			params: {
				id: string;
				title: string;
				every_minutes: number;
				destination: string;
				message: string;
				enabled?: boolean;
				envelope?: unknown;
				actor_id?: string;
				actor_token?: string;
				allowed_actor_ids?: string[];
			},
		) => {
			const auth = authorizeNotifyCronOperator(
				params.actor_id,
				params.actor_token,
				params.allowed_actor_ids,
			);
			if (!auth.ok) {
				return toolTextResult(`notify-cron auth rejected: ${auth.reason ?? "unauthorized"}.`, true);
			}

			const destination = parseDestinationTarget(params.destination);
			if (destination === null) {
				return toolTextResult(
					"Invalid destination. Use telegram:<chat>[:thread] or discord:<channel>.",
					true,
				);
			}
			const destinationValidation = validateDestination(destination);
			if (!destinationValidation.ok) {
				return toolTextResult(destinationValidation.reason, true);
			}

			const envelope = params.envelope ?? defaultEnvelope;
			const envelopeValidation = validateEnvelope(envelope);
			if (!envelopeValidation.ok) {
				return toolTextResult(envelopeValidation.reason, true);
			}

			const job: NotifyCronJob = {
				id: params.id,
				title: params.title,
				everyMinutes: params.every_minutes,
				destination: destinationValidation.value,
				enabled: params.enabled ?? true,
				envelope: envelopeValidation.value,
				message: params.message,
			};
			scheduler.upsert(job);
			return toolTextResult(`Upserted notify-cron job ${job.id} (${job.everyMinutes}m).`);
		},
	}) as const;

export const makeNotifyCronTickTool = (scheduler: NotifyCronScheduler) =>
	({
		name: "notify_cron_tick",
		label: "Notify cron tick",
		description: "Run scheduler tick (idempotent + lease-aware) and return due sends",
		parameters: Type.Object({
			lease_owner: Type.String({ minLength: 1 }),
			now_ms: Type.Optional(Type.Number()),
			actor_id: Type.Optional(Type.String({ minLength: 1 })),
			actor_token: Type.Optional(Type.String({ minLength: 1 })),
			allowed_actor_ids: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
		}),
		execute: async (
			_toolCallId: string,
			params: {
				lease_owner: string;
				now_ms?: number;
				actor_id?: string;
				actor_token?: string;
				allowed_actor_ids?: string[];
			},
		) => {
			const auth = authorizeNotifyCronOperator(
				params.actor_id,
				params.actor_token,
				params.allowed_actor_ids,
			);
			if (!auth.ok) {
				return toolTextResult(`notify-cron auth rejected: ${auth.reason ?? "unauthorized"}.`, true);
			}

			const now = params.now_ms ?? Date.now();
			const result = scheduler.tick(params.lease_owner, now);
			if (result.blockedByLease) {
				return toolTextResult(`Tick blocked by lease owner ${result.lease?.owner ?? "unknown"}.`);
			}
			const invalid: string[] = [];
			const validRuns = result.runs.filter((run) => {
				const destinationValidation = validateDestination(run.destination);
				if (!destinationValidation.ok) {
					invalid.push(`${run.jobId}: ${destinationValidation.reason}`);
					return false;
				}
				const envelopeValidation = validateEnvelope(run.envelope);
				if (!envelopeValidation.ok) {
					invalid.push(`${run.jobId}: ${envelopeValidation.reason}`);
					return false;
				}
				return true;
			});
			const lines = validRuns.map((run) => `- ${run.jobId} -> ${run.idempotencyKey}`);
			const invalidLine =
				invalid.length === 0 ? "" : `\ninvalid=${invalid.length}\n${invalid.map((line) => `! ${line}`).join("\n")}`;
			return toolTextResult(
				`Tick owner=${params.lease_owner} due=${validRuns.length}\n` +
					(lines.length > 0 ? lines.join("\n") : "- no due jobs") +
					invalidLine,
			);
		},
	}) as const;

export const makeNotifyCronListTool = (scheduler: NotifyCronScheduler) =>
	({
		name: "notify_cron_list",
		label: "Notify cron list",
		description: "List configured notify-cron jobs",
		parameters: Type.Object({}),
		execute: async () => {
			const jobs = scheduler.list();
			if (jobs.length === 0) return toolTextResult("No notify-cron jobs configured.");
			const lines = jobs.map((entry) => {
				const j = entry.job;
				return `${j.id} every=${j.everyMinutes}m enabled=${j.enabled} last=${entry.lastSuccessAt ?? "-"} -> ${j.destination.platform}:${j.destination.id}`;
			});
			return toolTextResult(lines.join("\n"));
		},
	}) as const;

export const makeNotifyCronRemoveTool = (scheduler: NotifyCronScheduler) =>
	({
		name: "notify_cron_remove",
		label: "Notify cron remove",
		description: "Remove a notify-cron job",
		parameters: Type.Object({
			id: Type.String({ minLength: 1, maxLength: 128 }),
			actor_id: Type.Optional(Type.String({ minLength: 1 })),
			actor_token: Type.Optional(Type.String({ minLength: 1 })),
			allowed_actor_ids: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
		}),
		execute: async (
			_toolCallId: string,
			params: {
				id: string;
				actor_id?: string;
				actor_token?: string;
				allowed_actor_ids?: string[];
			},
		) => {
			const auth = authorizeNotifyCronOperator(
				params.actor_id,
				params.actor_token,
				params.allowed_actor_ids,
			);
			if (!auth.ok) {
				return toolTextResult(`notify-cron auth rejected: ${auth.reason ?? "unauthorized"}.`, true);
			}
			const removed = scheduler.remove(params.id);
			return toolTextResult(removed ? `Removed ${params.id}.` : `Job ${params.id} not found.`, !removed);
		},
	}) as const;
