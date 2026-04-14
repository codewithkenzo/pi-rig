import { Effect } from "effect";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { FlowQueueService } from "./queue.js";
import { loadProfiles } from "./profiles.js";
import type { FlowJob } from "./types.js";

// ── Inline ANSI helpers ───────────────────────────────────────────────────────
// Standard ANSI — adapts to terminal theme, no extra dependencies.

const C = {
  bold:       (s: string) => `\x1b[1m${s}\x1b[22m`,
  dim:        (s: string) => `\x1b[2m${s}\x1b[22m`,
  reset:      (s: string) => `\x1b[0m${s}\x1b[0m`,
  green:      (s: string) => `\x1b[32m${s}\x1b[39m`,
  red:        (s: string) => `\x1b[31m${s}\x1b[39m`,
  yellow:     (s: string) => `\x1b[33m${s}\x1b[39m`,
  cyan:       (s: string) => `\x1b[36m${s}\x1b[39m`,
  magenta:    (s: string) => `\x1b[35m${s}\x1b[39m`,
  gray:       (s: string) => `\x1b[90m${s}\x1b[39m`,
  boldGreen:  (s: string) => `\x1b[1;32m${s}\x1b[0m`,
  boldRed:    (s: string) => `\x1b[1;31m${s}\x1b[0m`,
  boldYellow: (s: string) => `\x1b[1;33m${s}\x1b[0m`,
} as const;

const STATUS_COLOR: Record<FlowJob["status"], (s: string) => string> = {
  running:   C.boldGreen,
  pending:   C.yellow,
  done:      C.dim,
  failed:    C.boldRed,
  cancelled: C.gray,
};

const STATUS_ICON: Record<FlowJob["status"], string> = {
  running:   "▶",
  pending:   "○",
  done:      "✓",
  failed:    "✗",
  cancelled: "⊘",
};

const SECTION_HEADER: Record<FlowJob["status"], (n: number) => string> = {
  running:   (n) => C.boldGreen(`▶  Running (${n})`),
  pending:   (n) => C.boldYellow(`○  Pending (${n})`),
  done:      (n) => C.dim(`✓  Done (${n})`),
  failed:    (n) => C.boldRed(`✗  Failed (${n})`),
  cancelled: (n) => C.gray(`⊘  Cancelled (${n})`),
};

const DIVIDER = C.dim("─".repeat(52));

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
	const durationStr =
		job.finishedAt !== undefined && job.startedAt !== undefined
			? C.dim(`  (${formatDuration(job.finishedAt - job.startedAt)})`)
			: job.startedAt !== undefined
				? C.dim(`  (${formatDuration(Date.now() - job.startedAt)})`)
				: "";

	const color  = STATUS_COLOR[job.status];
	const icon   = color(STATUS_ICON[job.status] ?? "?");
	const profile = color(job.profile.padEnd(12));
	const task    = job.task.slice(0, 68) + (job.task.length > 68 ? "…" : "");
	const id      = C.gray(`  ${job.id}`);

	return `  ${icon}  ${profile}  ${task}${durationStr}\n${id}`;
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
						await ctx.ui.notify(C.dim("No flow jobs."));
						return;
					}

					const byStatus = (s: FlowJob["status"]) => jobs.filter((j) => j.status === s);

					const running   = byStatus("running");
					const pending   = byStatus("pending");
					const done      = byStatus("done");
					const failed    = byStatus("failed");
					const cancelled = byStatus("cancelled");

					const sections: string[] = [];

					const pushSection = (
						status: FlowJob["status"],
						group: FlowJob[],
						limit?: number,
					): void => {
						if (group.length === 0) return;
						sections.push(SECTION_HEADER[status](group.length));
						sections.push(DIVIDER);
						const shown = limit !== undefined ? group.slice(-limit) : group;
						shown.forEach((j) => sections.push(formatJob(j)));
						if (limit !== undefined && group.length > limit) {
							sections.push(C.dim(`  … and ${group.length - limit} more`));
						}
						sections.push("");
					};

					pushSection("running",   running);
					pushSection("pending",   pending);
					pushSection("failed",    failed);
					pushSection("done",      done, 5);
					pushSection("cancelled", cancelled, 3);

					await ctx.ui.notify(sections.join("\n"));
					break;
				}

				case "cancel": {
					const id = parts[1];
					if (id === undefined) {
						await ctx.ui.notify(C.yellow("Usage: /flow cancel <job-id>"));
						return;
					}

					const result = await Effect.runPromise(
						queue.cancel(id).pipe(Effect.result),
					);

					if (result._tag === "Failure") {
						await ctx.ui.notify(C.red(`✗  Job not found: ${id}`));
					} else {
						await ctx.ui.notify(C.gray(`⊘  Cancelled: ${id}`));
					}
					break;
				}

				case "profiles": {
					const profiles = loadProfiles(process.cwd());

					const COL = { name: 14, reasoning: 8, iter: 5, tools: 24 };
					const header =
						C.dim("  " +
							"NAME".padEnd(COL.name) +
							"REASONING".padEnd(COL.reasoning) +
							"ITER".padEnd(COL.iter) +
							"TOOLS".padEnd(COL.tools) +
							"DESCRIPTION");

					const lines: string[] = [
						C.bold(`  Profiles (${profiles.length})`),
						C.dim("─".repeat(72)),
						header,
						C.dim("─".repeat(72)),
					];

					for (const p of profiles) {
						const toolsets = p.toolsets.length > 0 ? p.toolsets.join(", ") : C.dim("(inherits)");
						const skillStr = p.skills.length > 0 ? C.magenta(` +${p.skills.length} skills`) : "";
						const desc     = p.description !== undefined ? C.dim(p.description) : "";

						const reasoningStyled =
							p.reasoning_level === "high"   ? C.yellow(p.reasoning_level.padEnd(COL.reasoning)) :
							p.reasoning_level === "medium" ? p.reasoning_level.padEnd(COL.reasoning) :
							C.dim(p.reasoning_level.padEnd(COL.reasoning));

						lines.push(
							"  " +
							C.cyan(p.name.padEnd(COL.name)) +
							reasoningStyled +
							String(p.max_iterations).padEnd(COL.iter) +
							toolsets.padEnd(COL.tools) +
							desc +
							skillStr,
						);
					}

					await ctx.ui.notify(lines.join("\n"));
					break;
				}

				default: {
					await ctx.ui.notify(
						C.yellow(`Unknown subcommand "${sub}". Use: /flow status | /flow cancel <id> | /flow profiles`),
					);
				}
			}
		},
	});
}
