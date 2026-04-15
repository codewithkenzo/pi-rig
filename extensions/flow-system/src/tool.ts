import { Type } from "@sinclair/typebox";
import { Effect, Exit } from "effect";
import type { AgentToolUpdateCallback, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { FlowQueueService } from "./queue.js";
import { getProfile } from "./profiles.js";
import { executeFlow, type ExecuteOptions, type FlowProgressEvent } from "./executor.js";
import { formatFlowError, isFlowCancelledCause } from "./errors.js";
import { renderFlowRunCall, renderFlowRunResult, type FlowRenderDetails } from "./renderers.js";
import { createFlowProgressTracker } from "./progress.js";
import { createProfileMetaHandlers } from "./profile-meta.js";

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

const describeError = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const summarize = (text: string): string => {
	const normalized = text.trim();
	if (normalized.length === 0) {
		return "(no output)";
	}
	return normalized.length > 160 ? `${normalized.slice(0, 160)}…` : normalized;
};

const applyProgress = (
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
	await setTerminalStatus(queue, jobId, "cancelled", {
		finishedAt: Date.now(),
		toolCount,
		lastProgress: "cancelled",
		...(recentTools !== undefined && recentTools.length > 0 ? { recentTools } : {}),
	});
};

const cancelJob = (queue: FlowQueueService, jobId: string): void => {
	runFireAndForget(`cancel request for job ${jobId}`, queue.cancel(jobId));
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

const cancelledResult = (
	profileName: string,
	jobId: string,
	background: boolean,
	toolCount: number,
	durationMs?: number,
) => ({
	content: [{ type: "text" as const, text: `Flow cancelled: ${profileName}` }],
	details: {
		jobId,
		profile: profileName,
		background,
		status: "cancelled",
		toolCount,
		...(durationMs !== undefined ? { durationMs } : {}),
		summary: "cancelled",
	} satisfies FlowRenderDetails,
});

export function makeFlowTool(queue: FlowQueueService, runFlow: ExecuteFlowFn = executeFlow) {
	return {
		name: "flow_run",
		label: "Run Flow",
		description:
			"Run a task using a named flow profile. Profiles control reasoning level, toolsets, model/agent defaults, and injected skills. Use background=true to fire and forget.",
		parameters: Type.Object({
			profile: Type.String({
				description:
					"Profile name. Built-ins: explore, research, coder, debug, browser, ambivalent.",
			}),
			task: Type.String({
				description: "The task prompt to send to the subagent.",
			}),
			cwd: Type.Optional(
				Type.String({
					description:
						"Working directory for the subagent. Prefer explicit value; defaults to current process cwd.",
				}),
			),
			background: Type.Optional(
				Type.Boolean({
					description:
						"If true, enqueue and return immediately without waiting for the result. Defaults to false.",
				}),
			),
		}),
		renderCall: (
			args: Parameters<typeof renderFlowRunCall>[0],
			theme: Parameters<typeof renderFlowRunCall>[1],
		) => renderFlowRunCall(args, theme),
		renderResult: (
			result: Parameters<typeof renderFlowRunResult>[0],
			options: Parameters<typeof renderFlowRunResult>[1],
			theme: Parameters<typeof renderFlowRunResult>[2],
		) => renderFlowRunResult(result, options, theme),
		execute: async (
			_toolCallId: string,
			params: { profile: string; task: string; cwd?: string; background?: boolean },
			signal: AbortSignal | undefined,
			onUpdate: AgentToolUpdateCallback<unknown> | undefined,
			ctx: ExtensionContext,
		) => {
			const { profile: profileName, task, cwd, background = false } = params;
			if (signal?.aborted) {
				return {
					content: [{ type: "text" as const, text: `Flow cancelled before start: ${profileName}` }],
					details: {
						profile: profileName,
						status: "cancelled",
						summary: "cancelled before start",
					} satisfies FlowRenderDetails,
				};
			}
			emitUpdate(onUpdate, `Resolving flow profile "${profileName}"…`, {
				profile: profileName,
				phase: "resolve-profile",
			} satisfies FlowRenderDetails);

			const profileExit = await Effect.runPromiseExit(
				getProfile(profileName, cwd ?? process.cwd()),
			);

			if (Exit.isFailure(profileExit)) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Unknown profile "${profileName}". Available built-ins: explore, research, coder, debug, browser, ambivalent.`,
						},
					],
					details: {
						profile: profileName,
						status: "failed",
						summary: `unknown profile ${profileName}`,
					} satisfies FlowRenderDetails,
					isError: true,
				};
			}

			const profile = profileExit.value;
			const job = await Effect.runPromise(queue.enqueue(profileName, task, cwd));
			const profileMeta = createProfileMetaHandlers(profile, (meta) => {
				runFireAndForget(
					`syncing profile metadata for job ${job.id}`,
					queue.setStatus(job.id, "running", {
						model: meta.model ?? "",
						agent: meta.agent ?? "",
					}),
				);
			});
			const jobController = new AbortController();
			await Effect.runPromise(queue.bindAbort(job.id, () => jobController.abort()));
			if (signal?.aborted) {
				jobController.abort();
				cancelJob(queue, job.id);
				await markCancelled(queue, job.id, 0);
				return cancelledResult(profileName, job.id, background, 0);
			}
			emitUpdate(onUpdate, `Queued flow ${job.id} (${profileName}).`, {
				jobId: job.id,
				profile: profileName,
				phase: "queued",
				background,
			} satisfies FlowRenderDetails);

			if (background) {
				if (signal?.aborted) {
					cancelJob(queue, job.id);
					await markCancelled(queue, job.id, 0);
					return cancelledResult(profileName, job.id, true, 0);
				}

				void (async () => {
					const startedAt = Date.now();
					const tracker = createFlowProgressTracker();
					try {
						await Effect.runPromise(
							queue.setStatus(job.id, "running", {
								...profileMeta.metaPatch(),
								startedAt,
								toolCount: tracker.toolCount,
								lastProgress: "starting",
								recentTools: tracker.recentTools,
							}),
						);
						const onProgress = (event: FlowProgressEvent): void => {
							const update = tracker.apply(event);
							if (update !== undefined) {
								applyProgress(queue, job.id, update.extras);
							}
						};
						const exit = await Effect.runPromiseExit(
							runFlow({
								task,
								profile,
								cwd,
								onProgress,
								signal: jobController.signal,
								onModelFallback: profileMeta.onModelFallback,
								onAgentPromptUnavailable: profileMeta.onAgentPromptUnavailable,
							} satisfies ExecuteOptions),
						);
						if (Exit.isSuccess(exit)) {
							const finishedAt = Date.now();
							const flushed = tracker.flush();
							await setTerminalStatus(queue, job.id, "done", {
								...profileMeta.metaPatch(),
								finishedAt,
								output: exit.value,
								toolCount: tracker.completedToolCount,
								lastProgress: "done",
								...(tracker.recentTools.length > 0 ? { recentTools: tracker.recentTools } : {}),
								...(flushed !== undefined ? { lastAssistantText: flushed.extras.lastAssistantText } : {}),
							});
							ctx.ui.notify(
								`✓ ${profileName} (${Math.max(1, Math.round((finishedAt - startedAt) / 100)) / 10}s)`,
								"info",
							);
						} else if (isFlowCancelledCause(exit.cause)) {
							await markCancelled(queue, job.id, tracker.toolCount, tracker.recentTools);
							ctx.ui.notify(`⊘ ${profileName} cancelled`, "warning");
						} else {
							const finishedAt = Date.now();
							await setTerminalStatus(queue, job.id, "failed", {
								...profileMeta.metaPatch(),
								finishedAt,
								error: formatFlowError(exit.cause),
								toolCount: tracker.toolCount,
								lastProgress: "failed",
								...(tracker.recentTools.length > 0 ? { recentTools: tracker.recentTools } : {}),
							});
							ctx.ui.notify(`✗ ${profileName} failed`, "error");
						}
						} catch (error) {
							const errorText = describeError(error);
							try {
								if (jobController.signal.aborted) {
									await markCancelled(queue, job.id, tracker.toolCount, tracker.recentTools);
								} else {
									await setTerminalStatus(queue, job.id, "failed", {
										...profileMeta.metaPatch(),
										finishedAt: Date.now(),
										error: errorText,
										toolCount: tracker.toolCount,
										lastProgress: "failed",
										...(tracker.recentTools.length > 0 ? { recentTools: tracker.recentTools } : {}),
									});
								}
							} catch {
							// Keep the catch path bounded; diagnostics below still fire.
						}
						const summary = jobController.signal.aborted ? `Flow ${job.id} cancelled.` : `Flow ${job.id} failed.`;
						ctx.ui.notify(summary, jobController.signal.aborted ? "warning" : "error");
						emitUpdate(onUpdate, summary, {
							jobId: job.id,
							profile: profileName,
							phase: jobController.signal.aborted ? "background-cancelled" : "background-failed",
							status: jobController.signal.aborted ? "cancelled" : "failed",
							summary: errorText,
						} satisfies FlowRenderDetails);
					} finally {
						// Suppress errors — clearAbort is fire-and-forget; an error here
						// must not produce an unhandled rejection from the detached IIFE.
						await Effect.runPromise(queue.clearAbort(job.id)).catch(() => {});
					}
				})();

				return {
					content: [
						{
							type: "text" as const,
							text: `Job enqueued in background.\nID:      ${job.id}\nProfile: ${profileName}\nTask:    ${task}`,
						},
					],
					details: {
						jobId: job.id,
						profile: profileName,
						background: true,
						status: "pending",
						summary: `queued ${profileName}`,
					} satisfies FlowRenderDetails,
				};
			}

			const tracker = createFlowProgressTracker();
			const startedAt = Date.now();
			const cancelFromSignal = (): void => {
				cancelJob(queue, job.id);
			};
			signal?.addEventListener("abort", cancelFromSignal, { once: true });

			try {
				await Effect.runPromise(
					queue.setStatus(job.id, "running", {
						...profileMeta.metaPatch(),
						startedAt,
						toolCount: tracker.toolCount,
						lastProgress: "starting",
						recentTools: tracker.recentTools,
					}),
				);
				emitUpdate(onUpdate, `Running flow ${job.id} (${profileName})…`, {
					jobId: job.id,
					profile: profileName,
					phase: "running",
				} satisfies FlowRenderDetails);

				const onProgress = (event: FlowProgressEvent): void => {
					const update = tracker.apply(event);
					if (update === undefined) {
						return;
					}
					applyProgress(queue, job.id, update.extras);
					emitUpdate(onUpdate, `${profileName}: ${update.summary}`, {
						jobId: job.id,
						profile: profileName,
						phase: "progress",
						toolCount: tracker.toolCount,
						summary: update.summary,
					} satisfies FlowRenderDetails);
				};

				const exit = await Effect.runPromiseExit(
					runFlow({
						task,
						profile,
						cwd,
						onProgress,
						signal: jobController.signal,
						onModelFallback: profileMeta.onModelFallback,
						onAgentPromptUnavailable: profileMeta.onAgentPromptUnavailable,
					} satisfies ExecuteOptions),
				);

				if (Exit.isSuccess(exit)) {
					const finishedAt = Date.now();
					const flushed = tracker.flush();
					await setTerminalStatus(queue, job.id, "done", {
						...profileMeta.metaPatch(),
						finishedAt,
						output: exit.value,
						toolCount: tracker.completedToolCount,
						lastProgress: "done",
						...(tracker.recentTools.length > 0 ? { recentTools: tracker.recentTools } : {}),
						...(flushed !== undefined ? { lastAssistantText: flushed.extras.lastAssistantText } : {}),
					});
					return {
						content: [{ type: "text" as const, text: exit.value || "(no output)" }],
						details: {
							jobId: job.id,
							profile: profileName,
							background: false,
							status: "done",
							toolCount: tracker.completedToolCount,
							durationMs: finishedAt - startedAt,
							summary: summarize(exit.value),
						} satisfies FlowRenderDetails,
					};
				}

				if (isFlowCancelledCause(exit.cause)) {
					const finishedAt = Date.now();
					await markCancelled(queue, job.id, tracker.toolCount, tracker.recentTools);
					return cancelledResult(profileName, job.id, false, tracker.toolCount, finishedAt - startedAt);
				}

				const errText = formatFlowError(exit.cause);
				const finishedAt = Date.now();
				await setTerminalStatus(queue, job.id, "failed", {
					...profileMeta.metaPatch(),
					finishedAt,
					error: errText,
					toolCount: tracker.toolCount,
					lastProgress: "failed",
					...(tracker.recentTools.length > 0 ? { recentTools: tracker.recentTools } : {}),
				});
				return {
					content: [{ type: "text" as const, text: `Flow failed: ${errText}` }],
					details: {
						jobId: job.id,
						profile: profileName,
						background: false,
						status: "failed",
						toolCount: tracker.toolCount,
						durationMs: finishedAt - startedAt,
						summary: errText,
					} satisfies FlowRenderDetails,
					isError: true,
				};
			} finally {
				signal?.removeEventListener("abort", cancelFromSignal);
				await Effect.runPromise(queue.clearAbort(job.id));
			}
		},
	} as const;
}
