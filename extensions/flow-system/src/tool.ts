import { Type } from "@sinclair/typebox";
import { Effect, Exit, Cause } from "effect";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { FlowQueueService } from "./queue.js";
import { getProfile } from "./profiles.js";
import { executeFlow } from "./executor.js";
import { SubprocessError, SkillLoadError } from "./types.js";

function formatFlowError(cause: Cause.Cause<unknown>): string {
	const failures = Cause.failures(cause);
	for (const err of failures) {
		if (err instanceof SubprocessError) {
			const stderr = err.stderr.trim();
			return `Subprocess exited with code ${err.exitCode}${stderr ? `\n${stderr}` : ""}`;
		}
		if (err instanceof SkillLoadError) {
			return `Failed to load skill "${err.path}": ${err.reason}`;
		}
	}
	return Cause.pretty(cause);
}

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
			_signal: AbortSignal | undefined,
			_onUpdate: unknown,
			_ctx: ExtensionContext,
		) => {
			const { profile: profileName, task, cwd, background = false } = params;

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

			if (background) {
				// Fire and forget — kick off execution without awaiting
				void (async () => {
					await Effect.runPromise(
						queue.setStatus(job.id, "running", { startedAt: Date.now() }),
					);
					const exit = await Effect.runPromiseExit(executeFlow({ task, profile, cwd }));
					if (Exit.isSuccess(exit)) {
						await Effect.runPromise(
							queue.setStatus(job.id, "done", {
								finishedAt: Date.now(),
								output: exit.value,
							}),
						);
					} else {
						await Effect.runPromise(
							queue.setStatus(job.id, "failed", {
								finishedAt: Date.now(),
								error: formatFlowError(exit.cause),
							}),
						);
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
			await Effect.runPromise(
				queue.setStatus(job.id, "running", { startedAt: Date.now() }),
			);

			const exit = await Effect.runPromiseExit(executeFlow({ task, profile, cwd }));

			if (Exit.isSuccess(exit)) {
				await Effect.runPromise(
					queue.setStatus(job.id, "done", {
						finishedAt: Date.now(),
						output: exit.value,
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
