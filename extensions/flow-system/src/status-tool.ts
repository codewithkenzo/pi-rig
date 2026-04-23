import { Type } from "@sinclair/typebox";
import { Effect } from "effect";
import type { AgentToolUpdateCallback } from "@mariozechner/pi-coding-agent";
import type { FlowQueueService } from "./queue.js";
import type { FlowJob, FlowJobStatus } from "./types.js";
import { waitForTerminalState } from "./scheduler.js";
import type { FlowRenderDetails } from "./renderers.js";

type FlowStatusParams = {
	jobId?: string;
	wait?: boolean;
	timeoutMs?: number;
	includeOutput?: boolean;
	limit?: number;
};

const isTerminalStatus = (status: FlowJobStatus): boolean =>
	status === "done" || status === "failed" || status === "cancelled";

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

const summarize = (text: string | undefined, maxChars = 240): string | undefined => {
	if (text === undefined) {
		return undefined;
	}
	const normalized = text.trim();
	if (normalized.length === 0) {
		return undefined;
	}
	return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}…` : normalized;
};

const formatDuration = (ms: number): string => {
	if (ms < 1000) return `${ms}ms`;
	const seconds = Math.round(ms / 100) / 10;
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const rem = Math.round(seconds % 60);
	return `${minutes}m${rem}s`;
};

const statusSummary = (job: FlowJob): string =>
	summarize(job.output) ??
	summarize(job.error) ??
	summarize(job.lastAssistantText) ??
	summarize(job.lastProgress) ??
	"(no summary)";

const findMatchingJobs = (jobs: readonly FlowJob[], query: string): FlowJob[] => {
	const exact = jobs.filter((job) => job.id === query);
	if (exact.length > 0) {
		return exact;
	}
	return jobs.filter((job) => job.id.startsWith(query));
};

const formatEnvelope = (job: FlowJob): string | undefined => {
	const envelope = job.envelope;
	if (envelope === undefined) {
		return undefined;
	}
	return [
		`reasoning ${envelope.reasoning}`,
		`max ${envelope.maxIterations}`,
		envelope.model !== undefined ? `model ${envelope.model}` : undefined,
		envelope.provider !== undefined ? `provider ${envelope.provider}` : undefined,
		envelope.preloadDigest !== undefined ? `preload ${envelope.preloadDigest}` : undefined,
	]
		.filter((value): value is string => value !== undefined)
		.join(" · ");
};

const formatJobList = (jobs: readonly FlowJob[]): string => {
	if (jobs.length === 0) {
		return "No flow jobs.";
	}
	const lines: string[] = [`Flow jobs (${jobs.length})`, ""];
	for (const job of jobs) {
		lines.push(`[${job.status.toUpperCase()}] ${job.id} · ${job.profile}`);
		lines.push(`  Task: ${job.task}`);
		lines.push(`  Summary: ${statusSummary(job)}`);
		if (job.toolCount !== undefined) {
			lines.push(`  Tools: ${job.toolCount}`);
		}
		lines.push("");
	}
	return lines.join("\n").trimEnd();
};

const formatDetailedJob = (job: FlowJob, includeOutput: boolean): string => {
	const durationMs =
		job.finishedAt !== undefined && job.startedAt !== undefined
			? job.finishedAt - job.startedAt
			: job.startedAt !== undefined
				? Date.now() - job.startedAt
				: undefined;
	const lines: string[] = [
		`Flow job ${job.id}`,
		`status: ${job.status}`,
		`profile: ${job.profile}`,
		`task: ${job.task}`,
	];
	if (job.toolCount !== undefined) {
		lines.push(`tools: ${job.toolCount}`);
	}
	if (durationMs !== undefined) {
		lines.push(`duration: ${formatDuration(durationMs)}`);
	}
	if (job.lastProgress !== undefined) {
		lines.push(`progress: ${job.lastProgress}`);
	}
	if (job.writingSummary === true) {
		lines.push(
			`phase: writing-summary${job.summaryPhaseSource !== undefined ? ` (${job.summaryPhaseSource})` : ""}`,
		);
	}
	const envelope = formatEnvelope(job);
	if (envelope !== undefined) {
		lines.push(`envelope: ${envelope}`);
	}
	lines.push(`summary: ${statusSummary(job)}`);

	const output = job.output?.trim();
	if (output !== undefined && output.length > 0) {
		lines.push("");
		lines.push(includeOutput ? "output:" : "output preview:");
		lines.push(includeOutput ? output : summarize(output, 1200) ?? "(no output)");
	}
	const error = job.error?.trim();
	if (error !== undefined && error.length > 0) {
		lines.push("");
		lines.push(includeOutput ? "error:" : "error preview:");
		lines.push(includeOutput ? error : summarize(error, 1200) ?? "(no error)");
	}
	return lines.join("\n");
};

export function makeFlowStatusTool(queue: FlowQueueService) {
	return {
		name: "flow_status",
		label: "Flow Status",
		description:
			"Inspect flow-system jobs and retrieve summaries or outputs, especially for background runs. Provide jobId to inspect one job. Set wait=true to block until that job reaches a terminal state.",
		parameters: Type.Object({
			jobId: Type.Optional(
				Type.String({
					description: "Exact job id or unique prefix returned by flow_run/flow_batch.",
				}),
			),
			wait: Type.Optional(
				Type.Boolean({
					description: "If true, wait for target job to finish. Requires jobId.",
				}),
			),
			timeoutMs: Type.Optional(
				Type.Integer({
					minimum: 1,
					maximum: 600000,
					description: "Max wait time when wait=true. Defaults to 300000 (5m).",
				}),
			),
			includeOutput: Type.Optional(
				Type.Boolean({
					description: "If true, include full output/error for single-job lookups.",
				}),
			),
			limit: Type.Optional(
				Type.Integer({
					minimum: 1,
					maximum: 50,
					description: "Max jobs to include when listing all jobs. Defaults to 10.",
				}),
			),
		}),
		execute: async (
			_toolCallId: string,
			params: FlowStatusParams,
			signal: AbortSignal | undefined,
			onUpdate: AgentToolUpdateCallback<unknown> | undefined,
			_ctx: unknown,
		) => {
			const { jobId, wait = false, timeoutMs = 300000, includeOutput = false, limit = 10 } = params;

			if (wait && jobId === undefined) {
				return {
					content: [{ type: "text" as const, text: "flow_status wait=true requires jobId." }],
					details: {
						status: "failed",
						summary: "wait requested without jobId",
					} satisfies FlowRenderDetails,
					isError: true,
				};
			}

			let jobs = await Effect.runPromise(queue.getAll());
			if (jobId === undefined) {
				const selected = [...jobs]
					.sort((left, right) => right.createdAt - left.createdAt)
					.slice(0, limit);
				const activeCount = jobs.filter((job) => !isTerminalStatus(job.status)).length;
				return {
					content: [{ type: "text" as const, text: formatJobList(selected) }],
					details: {
						count: selected.length,
						summary: `${jobs.length} jobs total, ${activeCount} active`,
					} satisfies FlowRenderDetails,
				};
			}

			const matches = findMatchingJobs(jobs, jobId);
			if (matches.length === 0) {
				return {
					content: [{ type: "text" as const, text: `No flow job matched: ${jobId}` }],
					details: {
						status: "failed",
						summary: `job not found ${jobId}`,
					} satisfies FlowRenderDetails,
					isError: true,
				};
			}
			if (matches.length > 1) {
				return {
					content: [
						{
							type: "text" as const,
							text: [
								`Ambiguous flow job id prefix: ${jobId}`,
								...matches.slice(0, 10).map((job) => `- ${job.id} (${job.status}) ${job.profile}`),
							].join("\n"),
						},
					],
					details: {
						status: "failed",
						summary: `ambiguous job prefix ${jobId}`,
					} satisfies FlowRenderDetails,
					isError: true,
				};
			}

			let job = matches[0]!;
			if (wait && !isTerminalStatus(job.status)) {
				emitUpdate(onUpdate, `Waiting for flow ${job.id} to finish…`, {
					jobId: job.id,
					profile: job.profile,
					phase: "waiting",
					status: job.status,
				} satisfies FlowRenderDetails);
				const waitResult = await waitForTerminalState(queue, job.id, signal, timeoutMs);
				jobs = await Effect.runPromise(queue.getAll());
				job = jobs.find((candidate) => candidate.id === job.id) ?? job;
				if (waitResult === "timeout") {
					return {
						content: [
							{
								type: "text" as const,
								text: `${formatDetailedJob(job, includeOutput)}\n\nTimed out waiting after ${formatDuration(timeoutMs)}.`,
							},
						],
						details: {
							jobId: job.id,
							profile: job.profile,
							status: job.status,
							summary: `timed out waiting for ${job.id}`,
						} satisfies FlowRenderDetails,
						isError: true,
					};
				}
				if (waitResult === "cancelled" && signal?.aborted) {
					return {
						content: [{ type: "text" as const, text: `flow_status cancelled while waiting for ${job.id}.` }],
						details: {
							jobId: job.id,
							profile: job.profile,
							status: "cancelled",
							summary: `cancelled while waiting for ${job.id}`,
						} satisfies FlowRenderDetails,
					};
				}
			}

			const durationMs =
				job.finishedAt !== undefined && job.startedAt !== undefined
					? job.finishedAt - job.startedAt
					: undefined;
			const summary = statusSummary(job);
			return {
				content: [{ type: "text" as const, text: formatDetailedJob(job, includeOutput) }],
				details: {
					jobId: job.id,
					profile: job.profile,
					status: job.status,
					...(job.toolCount !== undefined ? { toolCount: job.toolCount } : {}),
					...(durationMs !== undefined ? { durationMs } : {}),
					summary,
				} satisfies FlowRenderDetails,
				isError: job.status === "failed",
			};
		},
	} as const;
}
