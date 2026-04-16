import { Type } from "@sinclair/typebox";
import { Effect, Exit } from "effect";
import type { AgentToolUpdateCallback } from "@mariozechner/pi-coding-agent";
import type { FlowQueueService } from "./queue.js";
import { getProfile } from "./profiles.js";
import { executeFlow, type ExecuteOptions, type FlowProgressEvent } from "./executor.js";
import type { FlowJob } from "./types.js";
import { formatFlowError, isFlowCancelledCause } from "./errors.js";
import { renderFlowBatchCall, renderFlowBatchResult, type FlowRenderDetails } from "./renderers.js";
import { createFlowProgressTracker } from "./progress.js";
import { createProfileMetaHandlers } from "./profile-meta.js";
import {
	collectExecutionPreloadPrompt,
	resolveExecutionEnvelope,
	resolveExecutionPromptEnvelope,
} from "./envelope.js";
import {
	ExecutionPreloadSchema,
	ReasoningLevelSchema,
	type ExecutionEnvelope,
	type ResolvedExecutionEnvelope,
	FlowCancelledError,
} from "./types.js";
import { waitForRunSlot } from "./scheduler.js";

type ExecuteFlowFn = typeof executeFlow;

const emitUpdate = (
	onUpdate: AgentToolUpdateCallback<unknown> | undefined,
	text: string,
	details?: Record<string, unknown>,
): void => {
	onUpdate?.({
		content: [{ type: "text", text }],
		details,
	});
};

const summarize = (text: string): string => {
	const normalized = text.trim();
	if (normalized.length === 0) {
		return "(no output)";
	}
	return normalized.length > 180 ? `${normalized.slice(0, 180)}…` : normalized;
};

const isPiDebugEnabled = (): boolean => {
	const value = process.env.PI_DEBUG;
	return value !== undefined && value.length > 0;
};

const warnIfDebug = (message: string, cause: unknown): void => {
	if (isPiDebugEnabled()) {
		console.warn(`[flow-system] ${message}`, cause);
	}
};

const runFireAndForget = <T, E>(label: string, effect: Effect.Effect<T, E>): void => {
	void Effect.runPromise(effect.pipe(Effect.exit)).then((exit) => {
		if (exit._tag === "Failure") {
			warnIfDebug(`${label} failed`, exit.cause);
		}
	});
};

const setTerminalStatus = async (
	queue: FlowQueueService,
	jobId: string,
	status: "done" | "failed" | "cancelled",
	extras: Record<string, unknown>,
): Promise<boolean> => {
	const exit = await Effect.runPromise(queue.setStatus(jobId, status, extras).pipe(Effect.exit));
	if (exit._tag === "Success") {
		return true;
	}
	warnIfDebug(`failed to set terminal status "${status}" for job ${jobId}`, exit.cause);
	const fallbackExit = await Effect.runPromise(queue.cancel(jobId).pipe(Effect.exit));
	if (fallbackExit._tag === "Failure") {
		warnIfDebug(`fallback cancellation for job ${jobId} also failed`, fallbackExit.cause);
	}
	return false;
};

const updateProgress = (
	queue: FlowQueueService,
	jobId: string,
	extras: {
		toolCount: number;
		lastProgress: string;
		lastAssistantText?: string;
		recentTools?: string[];
	},
): void => {
	runFireAndForget(`status update (running) for job ${jobId}`, queue.setStatus(jobId, "running", extras));
};

const markCancelled = async (
	queue: FlowQueueService,
	jobId: string,
	toolCount: number,
	recentTools?: string[],
): Promise<void> => {
	await setTerminalStatus(
		queue,
		jobId,
		"cancelled",
		{
			finishedAt: Date.now(),
			toolCount,
			lastProgress: "cancelled",
			...(recentTools !== undefined && recentTools.length > 0 ? { recentTools } : {}),
		},
	);
};

interface BatchItem {
	profile: string;
	task: string;
	cwd?: string;
	model?: string;
	provider?: string;
	reasoning?: ExecutionEnvelope["reasoning"];
	effort?: ExecutionEnvelope["effort"];
	maxIterations?: number;
	max_iterations?: number;
	preload?: ExecutionEnvelope["preload"];
}

interface BatchResult {
	id: string;
	profile: string;
	task: string;
	status: "done" | "failed" | "cancelled";
	output?: string;
	error?: string;
}

interface RuntimeBatchItem {
	job: FlowJob;
	item: BatchItem;
	index: number;
	controller: AbortController;
}

const toExecutionEnvelopeInput = (item: BatchItem): ExecutionEnvelope => ({
	...(item.model !== undefined ? { model: item.model } : {}),
	...(item.provider !== undefined ? { provider: item.provider } : {}),
	...(item.reasoning !== undefined ? { reasoning: item.reasoning } : {}),
	...(item.effort !== undefined ? { effort: item.effort } : {}),
	...(item.maxIterations !== undefined ? { maxIterations: item.maxIterations } : {}),
	...(item.max_iterations !== undefined ? { max_iterations: item.max_iterations } : {}),
	...(item.preload !== undefined ? { preload: item.preload } : {}),
});

const withEnvelopePatch = <T extends object>(
	extras: T,
	envelope: ResolvedExecutionEnvelope,
): T & { envelope: ResolvedExecutionEnvelope } => ({
	...extras,
	envelope,
});

export function makeFlowBatchTool(queue: FlowQueueService, runFlow: ExecuteFlowFn = executeFlow) {
	return {
		name: "flow_batch",
		label: "Batch Flow",
		description:
			"Run multiple tasks in batch. Each item specifies a profile + task. Items run sequentially by default. Set parallel=true to run all concurrently.",
		parameters: Type.Object({
			items: Type.Array(
				Type.Object({
					profile: Type.String({ description: "Flow profile name." }),
					task: Type.String({ description: "Task prompt for this item." }),
					cwd: Type.Optional(
						Type.String({
							description: "Working directory. Prefer explicit value; defaults to process cwd.",
						}),
					),
					model: Type.Optional(Type.String({ minLength: 1 })),
					provider: Type.Optional(Type.String({ minLength: 1 })),
					reasoning: Type.Optional(ReasoningLevelSchema),
					effort: Type.Optional(ReasoningLevelSchema),
					maxIterations: Type.Optional(Type.Integer({ minimum: 1, maximum: 300 })),
					max_iterations: Type.Optional(Type.Integer({ minimum: 1, maximum: 300 })),
					preload: Type.Optional(ExecutionPreloadSchema),
				}),
				{ minItems: 1, maxItems: 32 },
			),
			parallel: Type.Optional(
				Type.Boolean({
					description: "Run all items in parallel. Defaults to false (sequential).",
				}),
			),
		}),
		renderCall: (
			args: Parameters<typeof renderFlowBatchCall>[0],
			theme: Parameters<typeof renderFlowBatchCall>[1],
		) => renderFlowBatchCall(args, theme),
		renderResult: (
			result: Parameters<typeof renderFlowBatchResult>[0],
			options: Parameters<typeof renderFlowBatchResult>[1],
			theme: Parameters<typeof renderFlowBatchResult>[2],
		) => renderFlowBatchResult(result, options, theme),
		execute: async (
			_toolCallId: string,
			params: { items: BatchItem[]; parallel?: boolean },
			signal: AbortSignal | undefined,
			onUpdate: AgentToolUpdateCallback<unknown> | undefined,
			_ctx: unknown,
		) => {
			const { items, parallel = false } = params;
			if (signal?.aborted) {
				return {
					content: [{ type: "text" as const, text: "Batch cancelled before start." }],
					details: { status: "cancelled", summary: "batch cancelled before start" } satisfies FlowRenderDetails,
				};
			}

			if (items.length === 0) {
				return {
					content: [{ type: "text" as const, text: "No items provided." }],
					details: { status: "failed", summary: "no batch items" } satisfies FlowRenderDetails,
					isError: true,
				};
			}

			const startedAt = Date.now();
			emitUpdate(onUpdate, `Resolving ${items.length} flow profile(s)…`, {
				count: items.length,
				parallel,
				phase: "resolve-profiles",
			} satisfies FlowRenderDetails);
			const profileResults = await Promise.all(
				items.map((item) =>
					Effect.runPromiseExit(getProfile(item.profile, item.cwd ?? process.cwd())),
				),
			);

			const unknownProfiles = items
				.map((item, i) => ({ item, exit: profileResults[i] }))
				.filter(({ exit }) => exit !== undefined && Exit.isFailure(exit))
				.map(({ item }) => item.profile);

			if (unknownProfiles.length > 0) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Unknown profiles: ${unknownProfiles.join(", ")}. Available built-ins: explore, research, coder, debug, browser, ambivalent.`,
						},
					],
					details: {
						count: items.length,
						parallel,
						status: "failed",
						summary: `unknown profiles ${unknownProfiles.join(", ")}`,
					} satisfies FlowRenderDetails,
					isError: true,
				};
			}

			const jobs: FlowJob[] = await Promise.all(
				items.map((item) =>
					Effect.runPromise(queue.enqueue(item.profile, item.task, item.cwd)),
				),
			);
			const runtimeItems: RuntimeBatchItem[] = await Promise.all(
				jobs.map(async (job, index) => {
					const controller = new AbortController();
					await Effect.runPromise(queue.bindAbort(job.id, () => controller.abort()));
					return { job, item: items[index]!, index, controller };
				}),
			);

			const cancelAll = (): void => {
				for (const runtimeItem of runtimeItems) {
					runtimeItem.controller.abort();
					runFireAndForget(`cancel request for job ${runtimeItem.job.id}`, queue.cancel(runtimeItem.job.id));
				}
			};
			signal?.addEventListener("abort", cancelAll, { once: true });
			if (signal?.aborted) {
				cancelAll();
			}

			const runJob = async ({ job, item, index, controller }: RuntimeBatchItem): Promise<BatchResult> => {
				emitUpdate(onUpdate, `Running batch item ${index + 1}/${items.length}: ${item.profile}`, {
					jobId: job.id,
					index,
					count: items.length,
					profile: item.profile,
					phase: "running",
				} satisfies FlowRenderDetails);
				const profileExit = profileResults[index];
				if (profileExit === undefined || Exit.isFailure(profileExit)) {
					return { id: job.id, profile: item.profile, task: item.task, status: "failed", error: "profile not found" };
				}
				if (controller.signal.aborted) {
					await markCancelled(queue, job.id, 0);
					return {
						id: job.id,
						profile: item.profile,
						task: item.task,
						status: "cancelled",
						error: "Flow cancelled.",
					};
				}

				const profile = profileExit.value;
				const resolvedEnvelope = resolveExecutionEnvelope(
					profile,
					item.task,
					toExecutionEnvelopeInput(item),
					_ctx,
				);
				const profileMeta = createProfileMetaHandlers(profile, (meta) => {
					runFireAndForget(
						`syncing profile metadata for job ${job.id}`,
						queue.setStatus(job.id, "running", {
							model: meta.model ?? "",
							agent: meta.agent ?? "",
						}),
					);
				});
				const tracker = createFlowProgressTracker();
				try {
					const currentStatus =
						queue.peek().jobs.find((queuedJob) => queuedJob.id === job.id)?.status ?? job.status;
					await Effect.runPromise(
						queue.setStatus(job.id, currentStatus, withEnvelopePatch({}, resolvedEnvelope)),
					);
					const slotStatus = await waitForRunSlot(queue, job.id, controller.signal);
					if (slotStatus !== "running") {
						if (slotStatus === "cancelled") {
							await markCancelled(queue, job.id, tracker.toolCount, tracker.recentTools);
							return {
								id: job.id,
								profile: item.profile,
								task: item.task,
								status: "cancelled",
								error: "Flow cancelled.",
							};
						}
						const errorText = `Flow ${job.id} reached terminal status ${slotStatus} before execution.`;
						await setTerminalStatus(
							queue,
							job.id,
							"failed",
							withEnvelopePatch(
								{
									...profileMeta.metaPatch(),
									finishedAt: Date.now(),
									error: errorText,
									toolCount: tracker.toolCount,
									lastProgress: "failed",
									...(tracker.recentTools.length > 0 ? { recentTools: tracker.recentTools } : {}),
								},
								resolvedEnvelope,
							),
						);
						return {
							id: job.id,
							profile: item.profile,
							task: item.task,
							status: "failed",
							error: errorText,
						};
					}

					await Effect.runPromise(
						queue.setStatus(job.id, "running", {
							...withEnvelopePatch(profileMeta.metaPatch(), resolvedEnvelope),
							startedAt: Date.now(),
							toolCount: tracker.toolCount,
							lastProgress: "starting",
							recentTools: tracker.recentTools,
						}),
					);
					const preloadPrompt = await Effect.runPromise(
						collectExecutionPreloadPrompt(
							resolvedEnvelope.preload,
							item.cwd ?? process.cwd(),
							controller.signal,
						),
					);
					const runEnvelope: ResolvedExecutionEnvelope = {
						...resolvedEnvelope,
						...(preloadPrompt.digest.length > 0 ? { preloadDigest: preloadPrompt.digest } : {}),
					};
					const systemPrompt = resolveExecutionPromptEnvelope(runEnvelope, preloadPrompt.prompt);
					const onProgress = (event: FlowProgressEvent): void => {
						const update = tracker.apply(event);
						if (update === undefined) {
							return;
						}
						updateProgress(queue, job.id, update.extras);
						emitUpdate(onUpdate, `${item.profile}: ${update.summary}`, {
							jobId: job.id,
							index,
							count: items.length,
							profile: item.profile,
							phase: "progress",
							toolCount: tracker.toolCount,
							summary: update.summary,
						} satisfies FlowRenderDetails);
					};

					const exit = await Effect.runPromiseExit(
						runFlow({
							task: item.task,
							profile,
							cwd: item.cwd,
							reasoning: runEnvelope.reasoning,
							model: runEnvelope.model,
							provider: runEnvelope.provider,
							systemPrompt,
							onProgress,
							signal: controller.signal,
							onModelFallback: profileMeta.onModelFallback,
							onAgentPromptUnavailable: profileMeta.onAgentPromptUnavailable,
						} satisfies ExecuteOptions),
					);

					if (Exit.isSuccess(exit)) {
						const finishedAt = Date.now();
						const flushed = tracker.flush();
						await setTerminalStatus(
							queue,
							job.id,
							"done",
							withEnvelopePatch(
								{
									...profileMeta.metaPatch(),
									finishedAt,
									output: exit.value,
									toolCount: tracker.completedToolCount,
									lastProgress: "done",
									...(tracker.recentTools.length > 0 ? { recentTools: tracker.recentTools } : {}),
									...(flushed !== undefined ? { lastAssistantText: flushed.extras.lastAssistantText } : {}),
								},
								runEnvelope,
							),
						);
						return {
							id: job.id,
							profile: item.profile,
							task: item.task,
							status: "done",
							output: exit.value || "(no output)",
						};
					}

					if (isFlowCancelledCause(exit.cause)) {
						await markCancelled(queue, job.id, tracker.toolCount, tracker.recentTools);
						return {
							id: job.id,
							profile: item.profile,
							task: item.task,
							status: "cancelled",
							error: "Flow cancelled.",
						};
					}

					const errText = formatFlowError(exit.cause);
					await setTerminalStatus(
						queue,
						job.id,
						"failed",
						withEnvelopePatch(
							{
								...profileMeta.metaPatch(),
								finishedAt: Date.now(),
								error: errText,
								toolCount: tracker.toolCount,
								lastProgress: "failed",
								...(tracker.recentTools.length > 0 ? { recentTools: tracker.recentTools } : {}),
							},
							runEnvelope,
						),
					);
					return {
						id: job.id,
						profile: item.profile,
						task: item.task,
						status: "failed",
						error: errText,
					};
				} catch (error) {
					const errorText = error instanceof Error ? error.message : String(error);
					if (controller.signal.aborted || error instanceof FlowCancelledError) {
						await markCancelled(queue, job.id, tracker.toolCount, tracker.recentTools);
						return {
							id: job.id,
							profile: item.profile,
							task: item.task,
							status: "cancelled",
							error: "Flow cancelled.",
						};
					}
					await setTerminalStatus(
						queue,
						job.id,
						"failed",
						withEnvelopePatch(
							{
								...profileMeta.metaPatch(),
								finishedAt: Date.now(),
								error: errorText,
								toolCount: tracker.toolCount,
								lastProgress: "failed",
								...(tracker.recentTools.length > 0 ? { recentTools: tracker.recentTools } : {}),
							},
							resolvedEnvelope,
						),
					);
					return {
						id: job.id,
						profile: item.profile,
						task: item.task,
						status: "failed",
						error: errorText,
					};
				}
			};

			let results: BatchResult[];

			try {
				if (parallel) {
					results = await Promise.all(runtimeItems.map((runtimeItem) => runJob(runtimeItem)));
				} else {
					results = [];
					for (const runtimeItem of runtimeItems) {
						results.push(await runJob(runtimeItem));
					}
				}
			} finally {
				signal?.removeEventListener("abort", cancelAll);
				await Promise.all(
					runtimeItems.map((runtimeItem) =>
						Effect.runPromise(queue.clearAbort(runtimeItem.job.id)),
					),
				);
			}

			const successCount = results.filter((r) => r.status === "done").length;
			const failCount = results.filter((r) => r.status === "failed").length;
			const cancelCount = results.filter((r) => r.status === "cancelled").length;

			const lines: string[] = [
				`Batch complete: ${successCount} done, ${failCount} failed, ${cancelCount} cancelled (${parallel ? "parallel" : "sequential"})`,
				"",
			];

			for (const r of results) {
				lines.push(`[${r.status.toUpperCase()}] ${r.profile}: ${r.task.slice(0, 60)}${r.task.length > 60 ? "…" : ""}`);
				lines.push(`  ID: ${r.id}`);
				if (r.status === "done" && r.output) {
					const preview = r.output.slice(0, 200);
					lines.push(`  Output: ${preview}${r.output.length > 200 ? "…" : ""}`);
				}
				if ((r.status === "failed" || r.status === "cancelled") && r.error) {
					lines.push(`  Error: ${r.error.slice(0, 200)}`);
				}
				lines.push("");
			}

			const durationMs = Date.now() - startedAt;
			const finalStatus = failCount > 0 ? "failed" : cancelCount > 0 ? "cancelled" : "done";

			return {
				content: [{ type: "text" as const, text: lines.join("\n").trimEnd() }],
				details: {
					count: items.length,
					successCount,
					failCount,
					cancelCount,
					parallel,
					status: finalStatus,
					durationMs,
					summary: summarize(lines.join(" ")),
				} satisfies FlowRenderDetails,
				isError: failCount > 0,
			};
		},
	} as const;
}
