import { Effect } from "effect";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { FlowQueueService } from "./queue.js";
import { loadProfiles } from "./profiles.js";
import type { FlowJob } from "./types.js";

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	const s = Math.round(ms / 100) / 10;
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	const rem = Math.round(s % 60);
	return `${m}m${rem}s`;
}

function formatJob(job: FlowJob): string {
	const elapsed =
		job.finishedAt !== undefined && job.startedAt !== undefined
			? ` (${formatDuration(job.finishedAt - job.startedAt)})`
			: job.startedAt !== undefined
				? ` (running ${formatDuration(Date.now() - job.startedAt)})`
				: "";

	const statusIcon: Record<FlowJob["status"], string> = {
		pending: "⏳",
		running: "▶",
		done: "✓",
		failed: "✗",
		cancelled: "⊘",
	};

	const icon = statusIcon[job.status] ?? "?";
	const taskPreview = job.task.slice(0, 72) + (job.task.length > 72 ? "…" : "");

	return `${icon} [${job.status.padEnd(9)}] ${job.profile.padEnd(12)} ${taskPreview}${elapsed}\n  ID: ${job.id}`;
}

// ── Command registration ──────────────────────────────────────────────────────

export function registerFlowCommands(pi: ExtensionAPI, queue: FlowQueueService): void {
	// /flow status
	pi.registerCommand("flow", {
		description: "Manage flow jobs. Subcommands: status, cancel, profiles",
		getArgumentCompletions: (_partial: string) => null,
		handler: async (args: string, ctx) => {
			const parts = args.trim().split(/\s+/).filter(Boolean);
			const sub = parts[0] ?? "status";

			switch (sub) {
				case "status": {
					const jobs = await Effect.runPromise(queue.getAll());

					if (jobs.length === 0) {
						await ctx.ui.notify("No flow jobs.");
						return;
					}

					const byStatus = (s: FlowJob["status"]) => jobs.filter((j) => j.status === s);

					const sections: string[] = [];

					const running = byStatus("running");
					const pending = byStatus("pending");
					const done = byStatus("done");
					const failed = byStatus("failed");
					const cancelled = byStatus("cancelled");

					if (running.length > 0) {
						sections.push(`Running (${running.length}):`);
						running.forEach((j) => sections.push(`  ${formatJob(j)}`));
					}
					if (pending.length > 0) {
						sections.push(`Pending (${pending.length}):`);
						pending.forEach((j) => sections.push(`  ${formatJob(j)}`));
					}
					if (done.length > 0) {
						sections.push(`Done (${done.length}):`);
						done.slice(-5).forEach((j) => sections.push(`  ${formatJob(j)}`));
						if (done.length > 5) sections.push(`  … and ${done.length - 5} more`);
					}
					if (failed.length > 0) {
						sections.push(`Failed (${failed.length}):`);
						failed.forEach((j) => sections.push(`  ${formatJob(j)}`));
					}
					if (cancelled.length > 0) {
						sections.push(`Cancelled (${cancelled.length}):`);
						cancelled.slice(-3).forEach((j) => sections.push(`  ${formatJob(j)}`));
					}

					await ctx.ui.notify(sections.join("\n"));
					break;
				}

				case "cancel": {
					const id = parts[1];
					if (id === undefined) {
						await ctx.ui.notify("Usage: /flow cancel <job-id>");
						return;
					}

					const result = await Effect.runPromise(
						queue.cancel(id).pipe(Effect.either),
					);

					if (result._tag === "Left") {
						await ctx.ui.notify(`Job not found: ${id}`);
					} else {
						await ctx.ui.notify(`Job ${id} cancelled.`);
					}
					break;
				}

				case "profiles": {
					const profiles = loadProfiles(process.cwd());

					const lines: string[] = [`Available profiles (${profiles.length}):`];
					for (const p of profiles) {
						const toolsets = p.toolsets.length > 0 ? p.toolsets.join(", ") : "(inherits)";
						const skills = p.skills.length > 0 ? ` skills: ${p.skills.join(", ")}` : "";
						const desc = p.description !== undefined ? ` — ${p.description}` : "";
						lines.push(
							`  ${p.name.padEnd(14)} reasoning: ${p.reasoning_level.padEnd(7)} iter: ${String(p.max_iterations).padEnd(4)} tools: ${toolsets}${skills}${desc}`,
						);
					}

					await ctx.ui.notify(lines.join("\n"));
					break;
				}

				default: {
					await ctx.ui.notify(
						`Unknown subcommand "${sub}". Use: /flow status | /flow cancel <id> | /flow profiles`,
					);
				}
			}
		},
	});
}
