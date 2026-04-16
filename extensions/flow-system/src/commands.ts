import { Effect, Exit } from "effect";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { FlowQueueService } from "./queue.js";
import { getProfile, loadProfiles } from "./profiles.js";
import { executeFlow, type ExecuteOptions, type FlowProgressEvent } from "./executor.js";
import { formatFlowError, isFlowCancelledCause } from "./errors.js";
import { createFlowProgressTracker } from "./progress.js";
import type { FlowJob } from "./types.js";
import { showFlowProfilePicker } from "./picker.js";
import { showFlowDeck } from "./deck/index.js";
import { sanitizeFlowText } from "./sanitize.js";
import { createProfileMetaHandlers } from "./profile-meta.js";
import { waitForRunSlot } from "./scheduler.js";

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

type FlowCommandRegistrationState = {
	commandRegistered: boolean;
	shortcutRegistered: boolean;
	markCommandRegistered: () => void;
	markShortcutRegistered: () => void;
};

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
	const rawTask = sanitizeFlowText(job.task);
	const task = rawTask.slice(0, 68) + (rawTask.length > 68 ? "…" : "");
	const id = C.gray(`  ${job.id}`);
	const tools = job.toolCount !== undefined ? C.dim(`  · tools ${job.toolCount}`) : "";
	const rawProgress = job.lastProgress !== undefined ? sanitizeFlowText(job.lastProgress) : undefined;
	const progress = rawProgress !== undefined ? C.dim(`\n  ↳ ${rawProgress.slice(0, 80)}`) : "";
	const envelope =
		job.envelope !== undefined
			? C.dim(
					`\n  ⚙ ${job.envelope.reasoning} · max ${job.envelope.maxIterations}` +
						(job.envelope.model !== undefined ? ` · ${job.envelope.model}` : "") +
						(job.envelope.provider !== undefined ? `@${job.envelope.provider}` : "") +
						(job.envelope.preloadDigest !== undefined ? ` · ${job.envelope.preloadDigest}` : ""),
				)
			: "";

	return `  ${icon}  ${profile}  ${task}${durationStr}${tools}\n${id}${progress}${envelope}`;
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
	const profileMeta = createProfileMetaHandlers(profile, (meta) => {
		void Effect.runPromise(
			queue
				.setStatus(job.id, "running", {
					model: meta.model ?? "",
					agent: meta.agent ?? "",
				})
				.pipe(Effect.result, Effect.asVoid),
		);
	});
	const jobController = new AbortController();
	await Effect.runPromise(queue.bindAbort(job.id, () => jobController.abort()));
	const slotStatus = await waitForRunSlot(queue, job.id, jobController.signal);
	if (slotStatus !== "running") {
		if (slotStatus === "cancelled") {
			const finishedAt = Date.now();
			await Effect.runPromise(
				queue.setStatus(job.id, "cancelled", {
					...profileMeta.metaPatch(),
					finishedAt,
					toolCount: 0,
					lastProgress: "cancelled",
				}),
			);
			await ctx.ui.notify(
				[`⊘ ${profileName} cancelled before run.`, C.dim(`ID: ${job.id}`)].join("\n"),
				"warning",
			);
			return;
		}

		const finishedAt = Date.now();
		await Effect.runPromise(
			queue.setStatus(job.id, slotStatus, {
				...profileMeta.metaPatch(),
				finishedAt,
				toolCount: 0,
				lastProgress: "failed",
				error: `Flow ${job.id} reached terminal status ${slotStatus} before execution.`,
			}),
		);
		await ctx.ui.notify(`✗ ${profileName} failed before run.`, "error");
		return;
	}

	const startedAt = Date.now();
	const tracker = createFlowProgressTracker();

	ctx.ui.setWorkingMessage(`▶ ${profileName}…`);
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
			if (update === undefined) {
				return;
			}
			void Effect.runPromise(
				queue
					.setStatus(job.id, "running", {
						...update.extras,
					})
					.pipe(Effect.result, Effect.asVoid),
			);
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
			const output = exit.value;
			const flushed = tracker.flush();
			await Effect.runPromise(
				queue.setStatus(job.id, "done", {
					...profileMeta.metaPatch(),
					finishedAt,
					output,
					toolCount: tracker.completedToolCount,
					lastProgress: "done",
					...(tracker.recentTools.length > 0 ? { recentTools: tracker.recentTools } : {}),
					...(flushed !== undefined ? { lastAssistantText: flushed.extras.lastAssistantText } : {}),
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
			await Effect.runPromise(
				queue
					.setStatus(job.id, "cancelled", {
						...profileMeta.metaPatch(),
						finishedAt,
						toolCount: tracker.toolCount,
						lastProgress: "cancelled",
						...(tracker.recentTools.length > 0 ? { recentTools: tracker.recentTools } : {}),
					})
					.pipe(Effect.result, Effect.asVoid),
			);
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
				...profileMeta.metaPatch(),
				finishedAt,
				error: errorText,
				toolCount: tracker.toolCount,
				lastProgress: "failed",
				...(tracker.recentTools.length > 0 ? { recentTools: tracker.recentTools } : {}),
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
		try {
			return await showFlowDeck(queue, ctx);
		} catch (err) {
			console.warn("[flow-deck] overlay init failed, falling back to text:", err);
		}
	}
	// Text-only fallback — also reached when deck init throws
	const snap = await Effect.runPromise(queue.snapshot());
	const lines = snap.jobs.map((job) => `${STATUS_ICON[job.status] ?? "?"} ${job.profile} · ${job.task}`);
	await ctx.ui.notify(lines.length > 0 ? lines.join("\n") : "No flow jobs.");
};

export function registerFlowCommands(
	pi: ExtensionAPI,
	queue: FlowQueueService,
	runFlow: ExecuteFlowFn = executeFlow,
	registrationState: FlowCommandRegistrationState = {
		commandRegistered: false,
		shortcutRegistered: false,
		markCommandRegistered: () => undefined,
		markShortcutRegistered: () => undefined,
	},
): void {
	if (!registrationState.commandRegistered) {
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
						if (job.envelope !== undefined) {
							const env = job.envelope;
							sections.push(C.bold("Execution envelope"));
							sections.push(DIVIDER);
							sections.push(
								[
									`reasoning: ${env.reasoning}`,
									`maxIterations: ${env.maxIterations}` +
										(env.requestedMaxIterations !== undefined
											? ` (requested ${env.requestedMaxIterations})`
											: ""),
									`model: ${env.model ?? "(default)"}`,
									`provider: ${env.provider ?? "(default)"}`,
									`preload: ${env.preloadDigest ?? "(none)"}`,
								].join("\n"),
							);
							sections.push("");
						}
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
					} else if (result.success === "already_terminal") {
						await ctx.ui.notify(C.yellow(`⚠  Job ${id} already finished.`));
					} else {
						await ctx.ui.notify(C.gray(`⊘  Cancelled: ${id}`));
					}
					break;
				}

				case "profiles": {
					const profiles = loadProfiles(ctx.cwd);

					const COL = { name: 14, reasoning: 10, model: 24, tools: 20 };
					const header =
						C.dim(
							"  " +
								"NAME".padEnd(COL.name) +
								"REASONING".padEnd(COL.reasoning) +
								"MODEL/AGENT".padEnd(COL.model) +
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
						const modelAndAgent = `${p.model ?? "(default)"}${p.agent !== undefined ? ` @${p.agent}` : ""}`;

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
								modelAndAgent.padEnd(COL.model) +
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
		registrationState.markCommandRegistered();
	}

	if (!registrationState.shortcutRegistered) {
		pi.registerShortcut("alt+shift+f", {
		description: "Manage running flows",
		handler: async (ctx) => {
			await showFlowManager(queue, ctx);
		},
	});
		registrationState.markShortcutRegistered();
	}
}
