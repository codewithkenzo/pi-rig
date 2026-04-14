import { Type } from "@sinclair/typebox";
import { Effect, Exit } from "effect";
import type { AgentToolUpdateCallback, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { FlowQueueService } from "./queue.js";
import { getProfile } from "./profiles.js";
import { executeFlow, type FlowProgressEvent } from "./executor.js";
import { formatFlowError } from "./errors.js";

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

const describeError = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const applyProgress = (
	queue: FlowQueueService,
	jobId: string,
	status: "running" | "done" | "failed",
	extras: { toolCount: number; lastProgress: string },
): void => {
	void Effect.runPromise(queue.setStatus(jobId, status, extras).pipe(Effect.result, Effect.asVoid));
};

// ── flow_run tool ─────────────────────────────────────────────────────────────

export function makeFlowTool(queue: FlowQueueService) {
	return {
		name: "flow_run",
		label: "Run Flow",
		description:
			"Run a task using a named flow profile. Profiles control reasoning level, max iterations, toolsets, and injected skills. Use background=true to fire and forget.",
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
						"Working directory for the subagent. Defaults to the current process cwd.",
				}),
			),
			background: Type.Optional(
				Type.Boolean({
					description:
						"If true, enqueue and return immediately without waiting for the result.",
				}),
			),
		}),
		execute: async (
			_toolCallId: string,
			params: { profile: string; task: string; cwd?: string; background?: boolean },
			signal: AbortSignal | undefined,
			onUpdate: AgentToolUpdateCallback<unknown> | undefined,
			_ctx: ExtensionContext,
		) => {
			const { profile: profileName, task, cwd, background = false } = params;
			if (signal?.aborted) {
				return {
					content: [{ type: "text" as const, text: `Flow cancelled before start: ${profileName}` }],
					details: undefined,
					isError: true,
				};
			}
			emitUpdate(onUpdate, `Resolving flow profile "${profileName}"…`, {
				profile: profileName,
				phase: "resolve-profile",
			});

			// Resolve profile
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
					details: undefined,
					isError: true,
				};
			}

			const profile = profileExit.value;

			// Enqueue the job
			const job = await Effect.runPromise(queue.enqueue(profileName, task, cwd));
			emitUpdate(onUpdate, `Queued flow ${job.id} (${profileName}).`, {
				jobId: job.id,
				profile: profileName,
				phase: "queued",
			});

			if (background) {
				// Fire and forget — kick off execution without awaiting
				void (async () => {
					let toolCount = 0;
					try {
						await Effect.runPromise(
							queue.setStatus(job.id, "running", { startedAt: Date.now(), toolCount, lastProgress: "starting" }),
						);
						const onProgress = (event: FlowProgressEvent): void => {
							if (event._tag === "tool_end") {
								toolCount += 1;
							}
							applyProgress(queue, job.id, "running", { toolCount, lastProgress: event.detail });
						};
						const exit = await Effect.runPromiseExit(executeFlow({ task, profile, cwd, onProgress }));
						if (Exit.isSuccess(exit)) {
							await Effect.runPromise(
								queue.setStatus(job.id, "done", {
									finishedAt: Date.now(),
									output: exit.value,
									toolCount,
									lastProgress: "done",
								}),
							);
						} else {
							await Effect.runPromise(
								queue.setStatus(job.id, "failed", {
									finishedAt: Date.now(),
									error: formatFlowError(exit.cause),
									toolCount,
									lastProgress: "failed",
								}),
							);
						}
					} catch (error) {
						const errorText = describeError(error);
						try {
							await Effect.runPromise(
								queue.setStatus(job.id, "failed", {
									finishedAt: Date.now(),
									error: errorText,
								}),
							);
						} catch {
							// Keep the catch path bounded; diagnostics below still fire.
						}
						const summary = `Flow ${job.id} failed.`;
						_ctx.ui.notify(summary, "error");
						emitUpdate(onUpdate, summary, {
							jobId: job.id,
							profile: profileName,
							phase: "background-failed",
							error: errorText,
						});
					}
				})();

				return {
					content: [
						{
							type: "text" as const,
							text: `Job enqueued in background.\nID:      ${job.id}\nProfile: ${profileName}\nTask:    ${task}`,
						},
					],
					details: undefined,
				};
			}

			// Foreground — run inline and await
			let toolCount = 0;
			await Effect.runPromise(
				queue.setStatus(job.id, "running", { startedAt: Date.now(), toolCount, lastProgress: "starting" }),
			);
			emitUpdate(onUpdate, `Running flow ${job.id} (${profileName})…`, {
				jobId: job.id,
				profile: profileName,
				phase: "running",
			});

			const onProgress = (event: FlowProgressEvent): void => {
				if (event._tag === "tool_end") {
					toolCount += 1;
				}
				applyProgress(queue, job.id, "running", { toolCount, lastProgress: event.detail });
				emitUpdate(onUpdate, `${profileName}: ${event.detail}`, {
					jobId: job.id,
					profile: profileName,
					phase: "progress",
					toolCount,
				});
			};

			const exit = await Effect.runPromiseExit(executeFlow({ task, profile, cwd, onProgress }));

			if (Exit.isSuccess(exit)) {
				await Effect.runPromise(
					queue.setStatus(job.id, "done", {
						finishedAt: Date.now(),
						output: exit.value,
						toolCount,
						lastProgress: "done",
					}),
				);
				return {
					content: [{ type: "text" as const, text: exit.value || "(no output)" }],
					details: undefined,
				};
			} else {
				const errText = formatFlowError(exit.cause);
				await Effect.runPromise(
					queue.setStatus(job.id, "failed", {
						finishedAt: Date.now(),
						error: errText,
						toolCount,
						lastProgress: "failed",
					}),
				);
				return {
					content: [{ type: "text" as const, text: `Flow failed: ${errText}` }],
					details: undefined,
					isError: true,
				};
			}
		},
	} as const;
}
