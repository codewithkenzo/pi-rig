import { Effect, Exit } from "effect";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { FlowQueueService } from "./queue.js";
import { getProfile, loadProfiles } from "./profiles.js";
import { executeFlow, type ExecuteOptions, type FlowProgressEvent } from "./executor.js";
import { formatFlowError, isFlowCancelledCause } from "./errors.js";
import type { FlowJob } from "./types.js";
import { showFlowProfilePicker } from "./picker.js";
import { showFlowDeck } from "./deck/index.js";

type ExecuteFlowFn = typeof executeFlow;

const C = {
	bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
	dim: (s: string) => `\x1b[2m${s}\x1b[22m`,
	green: (s: string) => `\x1b[32m${s}\x1b[39m`,
	red: (s: string) => `\x1b[31m${s}\x1b[39m`,
	yellow: (s: string) => `\x1b[33m${s}\x1b[39m`,
	cyan: (s: string) => `\x1b[36m${s}\x1b[39m`,
	magenta: (s: string) => `\x1b[35m${s}\x1b[39m`,
	gray: (s: string) => `\x1b[90m${s}\x1b[39m`,
	boldGreen: (s: string) => `\x1b[1;32m${s}\x1b[0m`,
	boldRed: (s: string) => `\x1b[1;31m${s}\x1b[0m`,
	boldYellow: (s: string) => `\x1b[1;33m${s}\x1b[0m`,
} as const;

const STATUS_COLOR: Record<FlowJob["status"], (s: string) => string> = {
	running: C.boldGreen,
	pending: C.yellow,
	done: C.dim,
	failed: C.boldRed,
	cancelled: C.gray,
};

const STATUS_ICON: Record<FlowJob["status"], string> = {
	running: "▶",
	pending: "○",
	done: "✓",
	failed: "✗",
	cancelled: "⊘",
};

const SECTION_HEADER: Record<FlowJob["status"], (n: number) => string> = {
	running: (n) => C.boldGreen(`▶  Running (${n})`),
	pending: (n) => C.boldYellow(`○  Pending (${n})`),
	done: (n) => C.dim(`✓  Done (${n})`),
	failed: (n) => C.boldRed(`✗  Failed (${n})`),
	cancelled: (n) => C.gray(`⊘  Cancelled (${n})`),
};

const DIVIDER = C.dim("─".repeat(52));
const RUN_USAGE = "Usage: /flow run <profile> -- <task>";
const DEFAULT_HELP = "Use: /flow manage | /flow status [id] | /flow cancel <id> | /flow profiles | /flow run <profile> -- <task> | /flow pick";
type FlowUiContext = Pick<ExtensionCommandContext, "cwd" | "ui">;

const completeFlowArgs = (raw: string, queue: FlowQueueService, cwd: string): { label: string; value: string }[] | null => {
	const trimmed = raw.trimStart();
	if (trimmed.length === 0) {
		return ["manage", "status", "cancel", "profiles", "run", "pick"].map((value) => ({ label: value, value }));
	}
	const parts = trimmed.split(/\s+/);
	const sub = parts[0] ?? "";
	const ids = queue.peek().jobs.map((job) => job.id);
	if (parts.length <= 1 && !raw.endsWith(" ")) {
		return ["manage", "status", "cancel", "profiles", "run", "pick"]
			.filter((value) => value.startsWith(sub))
			.map((value) => ({ label: value, value }));
	}
	if (sub === "cancel" || sub === "status") {
		const prefix = raw.endsWith(" ") ? "" : parts.at(-1) ?? "";
		return ids
			.filter((id) => id.startsWith(prefix))
			.map((id) => ({ label: id, value: `${sub} ${id}` }));
	}
	if (sub === "run") {
		const profilePrefix = parts[1] ?? "";
		return loadProfiles(cwd)
			.map((profile) => profile.name)
			.filter((name) => name.startsWith(profilePrefix))
			.map((name) => ({ label: name, value: `run ${name}` }));
	}
	return null;
};

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

	const color = STATUS_COLOR[job.status];
	const icon = color(STATUS_ICON[job.status] ?? "?");
	const profile = color(job.profile.padEnd(12));
	const task = job.task.slice(0, 68) + (job.task.length > 68 ? "…" : "");
	const id = C.gray(`  ${job.id}`);
	const tools = job.toolCount !== undefined ? C.dim(`  · tools ${job.toolCount}`) : "";
	const progress = job.lastProgress !== undefined ? C.dim(`\n  ↳ ${job.lastProgress.slice(0, 80)}`) : "";

	return `  ${icon}  ${profile}  ${task}${durationStr}${tools}\n${id}${progress}`;
}

const parseRunArgs = (rawArgs: string): { ok: true; profile: string; task: string } | { ok: false } => {
	const match = /^run\s+(\S+)\s+(?:--\s+)?([\s\S]+)$/u.exec(rawArgs.trim());
	if (match === null) {
		return { ok: false };
	}
	const profile = match[1];
	const task = match[2]?.trim() ?? "";
	if (profile === undefined || task.length === 0) {
		return { ok: false };
	}
	return { ok: true, profile, task };
};

const summarizeOutput = (text: string): string => {
	const normalized = text.trim();
	if (normalized.length === 0) {
		return "(no output)";
	}
	return normalized.length > 240 ? `${normalized.slice(0, 240)}…` : normalized;
};

const setRunningProgress = async (
	queue: FlowQueueService,
	id: string,
	toolCount: number,
	lastProgress: string,
): Promise<void> => {
	await Effect.runPromise(
		queue.setStatus(id, "running", { toolCount, lastProgress }).pipe(Effect.result, Effect.asVoid),
	);
};

const markCancelled = async (
	queue: FlowQueueService,
	id: string,
	toolCount: number,
): Promise<void> => {
	await Effect.runPromise(
		queue
			.setStatus(id, "cancelled", {
				finishedAt: Date.now(),
				toolCount,
				lastProgress: "cancelled",
			})
			.pipe(Effect.result, Effect.asVoid),
	);
};

const runFlowFromCommand = async (
	queue: FlowQueueService,
	ctx: FlowUiContext,
	profileName: string,
	task: string,
	runFlow: ExecuteFlowFn,
): Promise<void> => {
	const cwd = ctx.cwd;
	const profileExit = await Effect.runPromiseExit(getProfile(profileName, cwd));
	if (Exit.isFailure(profileExit)) {
		await ctx.ui.notify(
			C.red(
				`Unknown profile "${profileName}". Available built-ins: explore, research, coder, debug, browser, ambivalent.`,
			),
		);
		return;
	}

	const profile = profileExit.value;
	const job = await Effect.runPromise(queue.enqueue(profileName, task, cwd));
	const jobController = new AbortController();
	await Effect.runPromise(queue.bindAbort(job.id, () => jobController.abort()));
	const startedAt = Date.now();
	let toolCount = 0;

	ctx.ui.setWorkingMessage(`▶ ${profileName}…`);
	try {
		await Effect.runPromise(queue.setStatus(job.id, "running", { startedAt, toolCount, lastProgress: "starting" }));
		const onProgress = (event: FlowProgressEvent): void => {
			if (event._tag === "tool_end") {
				toolCount += 1;
			}
			void setRunningProgress(queue, job.id, toolCount, event.detail);
		};
		const exit = await Effect.runPromiseExit(
			runFlow({ task, profile, cwd, onProgress, signal: jobController.signal } satisfies ExecuteOptions),
		);

		if (Exit.isSuccess(exit)) {
			const finishedAt = Date.now();
			const output = exit.value;
			await Effect.runPromise(
				queue.setStatus(job.id, "done", {
					finishedAt,
					output,
					toolCount,
					lastProgress: "done",
				}),
			);
			await ctx.ui.notify(
				[
					C.green(`✓ ${profileName} completed in ${formatDuration(finishedAt - startedAt)}.`),
					C.dim(`ID: ${job.id}`),
					summarizeOutput(output),
				].join("\n"),
			);
			return;
		}

		if (isFlowCancelledCause(exit.cause)) {
			const finishedAt = Date.now();
			await markCancelled(queue, job.id, toolCount);
			await ctx.ui.notify(
				[
					C.gray(`⊘ ${profileName} cancelled after ${formatDuration(finishedAt - startedAt)}.`),
					C.dim(`ID: ${job.id}`),
				].join("\n"),
				"warning",
			);
			return;
		}

		const finishedAt = Date.now();
		const errorText = formatFlowError(exit.cause);
		await Effect.runPromise(
			queue.setStatus(job.id, "failed", {
				finishedAt,
				error: errorText,
				toolCount,
				lastProgress: "failed",
			}),
		);
		await ctx.ui.notify(
			[
				C.red(`✗ ${profileName} failed in ${formatDuration(finishedAt - startedAt)}.`),
				C.dim(`ID: ${job.id}`),
				errorText,
			].join("\n"),
			"error",
		);
	} finally {
		await Effect.runPromise(queue.clearAbort(job.id));
		ctx.ui.setWorkingMessage();
	}
};

const selectAndRunFlow = async (
	queue: FlowQueueService,
	ctx: FlowUiContext,
	runFlow: ExecuteFlowFn,
): Promise<void> => {
	const profiles = loadProfiles(ctx.cwd);
	if (profiles.length === 0) {
		await ctx.ui.notify(C.red("No flow profiles available."), "error");
		return;
	}
	const selectedProfile = await showFlowProfilePicker(ctx, profiles);
	if (selectedProfile === undefined) {
		return;
	}

	const task = await ctx.ui.input(`Task for ${selectedProfile}`, "Describe what to run");
	const trimmedTask = task?.trim() ?? "";
	if (trimmedTask.length === 0) {
		await ctx.ui.notify(C.yellow("Flow run cancelled: empty task."), "warning");
		return;
	}

	await runFlowFromCommand(queue, ctx, selectedProfile, trimmedTask, runFlow);
};

const showFlowManager = async (queue: FlowQueueService, ctx: FlowUiContext): Promise<void> => {
	const hasCustom = typeof (ctx.ui as { custom?: unknown }).custom === "function";
	if (hasCustom) {
		return showFlowDeck(queue, ctx);
	}
	// Text-only fallback when pi-tui custom overlay is unavailable
	const snap = await Effect.runPromise(queue.snapshot());
	const lines = snap.jobs.map((job) => `${STATUS_ICON[job.status] ?? "?"} ${job.profile} · ${job.task}`);
	await ctx.ui.notify(lines.length > 0 ? lines.join("\n") : "No flow jobs.");
};

export function registerFlowCommands(pi: ExtensionAPI, queue: FlowQueueService, runFlow: ExecuteFlowFn = executeFlow): void {
	pi.registerCommand("flow", {
		description: "Manage flow jobs. Subcommands: manage, status, cancel, profiles, run, pick",
		getArgumentCompletions: (partial: string) => completeFlowArgs(partial, queue, process.cwd()),
		handler: async (args: string, ctx) => {
			const parts = args.trim().split(/\s+/).filter(Boolean);
			const sub = parts[0] ?? "manage";

			switch (sub) {
				case "manage": {
					await showFlowManager(queue, ctx);
					break;
				}

				case "status": {
					const query = parts[1];
					const allJobs = await Effect.runPromise(queue.getAll());
					const jobs =
						query === undefined
							? allJobs
							: allJobs.filter((job) => job.id === query || job.id.startsWith(query));

					if (jobs.length === 0) {
						const note = query === undefined ? "No flow jobs." : `No flow jobs matched: ${query}`;
						await ctx.ui.notify(C.dim(note));
						return;
					}

					const byStatus = (s: FlowJob["status"]) => jobs.filter((j) => j.status === s);

					const running = byStatus("running");
					const pending = byStatus("pending");
					const done = byStatus("done");
					const failed = byStatus("failed");
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

					const historyLimit = query === undefined ? 5 : undefined;
					const cancelledLimit = query === undefined ? 3 : undefined;
					pushSection("running", running);
					pushSection("pending", pending);
					pushSection("failed", failed);
					pushSection("done", done, historyLimit);
					pushSection("cancelled", cancelled, cancelledLimit);

					if (query === undefined) {
						sections.push(C.dim("Tip: /flow status <id> for one job."));
					} else if (jobs.length === 1) {
						const job = jobs[0]!;
						if (job.output !== undefined && job.output.trim().length > 0) {
							sections.push(C.bold("Output preview"));
							sections.push(DIVIDER);
							sections.push(summarizeOutput(job.output));
						}
						if (job.error !== undefined && job.error.trim().length > 0) {
							sections.push("");
							sections.push(C.boldRed("Error preview"));
							sections.push(DIVIDER);
							sections.push(summarizeOutput(job.error));
						}
					}

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
					const profiles = loadProfiles(ctx.cwd);

					const COL = { name: 14, reasoning: 8, iter: 5, tools: 24 };
					const header =
						C.dim(
							"  " +
								"NAME".padEnd(COL.name) +
								"REASONING".padEnd(COL.reasoning) +
								"ITER".padEnd(COL.iter) +
								"TOOLS".padEnd(COL.tools) +
								"DESCRIPTION",
						);

					const lines: string[] = [
						C.bold(`  Profiles (${profiles.length})`),
						C.dim("─".repeat(72)),
						header,
						C.dim("─".repeat(72)),
					];

					for (const p of profiles) {
						const toolsets = p.toolsets.length > 0 ? p.toolsets.join(", ") : C.dim("(inherits)");
						const skillStr = p.skills.length > 0 ? C.magenta(` +${p.skills.length} skills`) : "";
						const desc = p.description !== undefined ? C.dim(p.description) : "";

						const reasoningStyled =
							p.reasoning_level === "high"
								? C.yellow(p.reasoning_level.padEnd(COL.reasoning))
								: p.reasoning_level === "medium"
									? p.reasoning_level.padEnd(COL.reasoning)
									: C.dim(p.reasoning_level.padEnd(COL.reasoning));

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

				case "run": {
					const parsed = parseRunArgs(args);
					if (!parsed.ok) {
						await ctx.ui.notify(C.yellow(RUN_USAGE));
						return;
					}
					await runFlowFromCommand(queue, ctx, parsed.profile, parsed.task, runFlow);
					break;
				}

				case "pick": {
					await selectAndRunFlow(queue, ctx, runFlow);
					break;
				}

				default: {
					await ctx.ui.notify(C.yellow(`Unknown subcommand "${sub}". ${DEFAULT_HELP}`));
				}
			}
		},
	});

	pi.registerShortcut("alt+shift+f", {
		description: "Manage running flows",
		handler: async (ctx) => {
			await showFlowManager(queue, ctx);
		},
	});
}
