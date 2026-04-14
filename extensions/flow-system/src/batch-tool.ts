import { Type } from "@sinclair/typebox";
import { Effect, Exit, Cause } from "effect";
import type { FlowQueueService } from "./queue.js";
import { getProfile } from "./profiles.js";
import { executeFlow } from "./executor.js";
import type { FlowJob } from "./types.js";

// ── flow_batch tool ───────────────────────────────────────────────────────────

interface BatchItem {
	profile: string;
	task: string;
	cwd?: string;
}

interface BatchResult {
	id: string;
	profile: string;
	task: string;
	status: "done" | "failed";
	output?: string;
	error?: string;
}

export function makeFlowBatchTool(queue: FlowQueueService) {
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
					cwd: Type.Optional(Type.String({ description: "Working directory." })),
				}),
				{ minItems: 1 },
			),
			parallel: Type.Optional(
				Type.Boolean({
					description: "Run all items in parallel. Default: false (sequential).",
				}),
			),
		}),
		execute: async (
			_toolCallId: string,
			params: { items: BatchItem[]; parallel?: boolean },
			_signal: AbortSignal | undefined,
			_onUpdate: unknown,
			_ctx: unknown,
		) => {
			const { items, parallel = false } = params;

			if (items.length === 0) {
				return {
					content: [{ type: "text" as const, text: "No items provided." }],
					details: undefined,
					isError: true,
				};
			}

			// Resolve all profiles up front — fail fast on unknown names
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
					details: undefined,
					isError: true,
				};
			}

			// Enqueue all jobs
			const jobs: FlowJob[] = await Promise.all(
				items.map((item) =>
					Effect.runPromise(queue.enqueue(item.profile, item.task, item.cwd)),
				),
			);

			// Runner for a single job
			const runJob = async (job: FlowJob, item: BatchItem, index: number): Promise<BatchResult> => {
				const profileExit = profileResults[index];
				if (profileExit === undefined || Exit.isFailure(profileExit)) {
					// Should not happen — we already checked above
					return { id: job.id, profile: item.profile, task: item.task, status: "failed", error: "profile not found" };
				}
				const profile = profileExit.value;

				await Effect.runPromise(
					queue.setStatus(job.id, "running", { startedAt: Date.now() }),
				);

				const exit = await Effect.runPromiseExit(
					executeFlow({ task: item.task, profile, cwd: item.cwd }),
				);

				if (Exit.isSuccess(exit)) {
					await Effect.runPromise(
						queue.setStatus(job.id, "done", {
							finishedAt: Date.now(),
							output: exit.value,
						}),
					);
					return {
						id: job.id,
						profile: item.profile,
						task: item.task,
						status: "done",
						output: exit.value || "(no output)",
					};
				} else {
					const errText = Cause.pretty(exit.cause);
					await Effect.runPromise(
						queue.setStatus(job.id, "failed", {
							finishedAt: Date.now(),
							error: errText,
						}),
					);
					return {
						id: job.id,
						profile: item.profile,
						task: item.task,
						status: "failed",
						error: errText,
					};
				}
			};

			let results: BatchResult[];

			if (parallel) {
				results = await Promise.all(jobs.map((job, i) => runJob(job, items[i]!, i)));
			} else {
				results = [];
				for (let i = 0; i < jobs.length; i++) {
					results.push(await runJob(jobs[i]!, items[i]!, i));
				}
			}

			const successCount = results.filter((r) => r.status === "done").length;
			const failCount = results.filter((r) => r.status === "failed").length;

			const lines: string[] = [
				`Batch complete: ${successCount} done, ${failCount} failed (${parallel ? "parallel" : "sequential"})`,
				"",
			];

			for (const r of results) {
				lines.push(`[${r.status.toUpperCase()}] ${r.profile}: ${r.task.slice(0, 60)}${r.task.length > 60 ? "…" : ""}`);
				lines.push(`  ID: ${r.id}`);
				if (r.status === "done" && r.output) {
					const preview = r.output.slice(0, 200);
					lines.push(`  Output: ${preview}${r.output.length > 200 ? "…" : ""}`);
				}
				if (r.status === "failed" && r.error) {
					lines.push(`  Error: ${r.error.slice(0, 200)}`);
				}
				lines.push("");
			}

			const hasErrors = failCount > 0;

			return {
				content: [{ type: "text" as const, text: lines.join("\n").trimEnd() }],
				details: undefined,
				isError: hasErrors,
			};
		},
	} as const;
}
