import { Effect, Exit } from "effect";
import { spawn } from "node:child_process";
import * as readline from "node:readline";
import { stageSkills, writeTempSkillFile, cleanupTempFile } from "./vfs.js";
import type { FlowProfile, ReasoningLevel } from "./types.js";
import { FlowCancelledError, SubprocessError, SkillLoadError } from "./types.js";
import { formatFlowError } from "./errors.js";

const TOOLSET_MAP: Record<string, readonly string[]> = {
	terminal: ["bash"],
	file: ["read", "write", "edit", "grep", "find", "ls"],
	code_execution: ["read", "bash", "edit", "write", "grep", "find", "ls"],
	// "web" and "browser" have no pi CLI equivalents — omitted (inherits default)
};

function resolveToolsets(toolsets: readonly string[]): string[] {
	const tools = new Set<string>();
	for (const ts of toolsets) {
		const mapped = TOOLSET_MAP[ts];
		if (mapped !== undefined) {
			for (const t of mapped) tools.add(t);
		}
	}
	return Array.from(tools);
}

interface PiContentText {
	type: "text";
	text: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const parseSignaturePhase = (value: unknown): "commentary" | "final_answer" | undefined => {
	if (typeof value !== "string" || !value.trimStart().startsWith("{")) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(value) as unknown;
		if (!isRecord(parsed)) {
			return undefined;
		}
		const phase = parsed["phase"];
		if (phase === "commentary" || phase === "final_answer") {
			return phase;
		}
		return undefined;
	} catch {
		return undefined;
	}
};

const phaseFromTextBlock = (value: unknown): "commentary" | "final_answer" | undefined => {
	if (!isRecord(value) || value["type"] !== "text") {
		return undefined;
	}
	return parseSignaturePhase(value["textSignature"]);
};

const summaryPhaseFromAssistantPartial = (
	value: unknown,
): "commentary" | "final_answer" | undefined => {
	if (!isRecord(value)) {
		return undefined;
	}
	const content = value["content"];
	if (!Array.isArray(content) || content.length === 0) {
		return undefined;
	}
	for (let i = content.length - 1; i >= 0; i -= 1) {
		const phase = phaseFromTextBlock(content[i]);
		if (phase !== undefined) {
			return phase;
		}
	}
	return undefined;
};

const summaryPhaseFromAssistantMessageEvent = (
	value: unknown,
): "commentary" | "final_answer" | undefined => {
	if (!isRecord(value)) {
		return undefined;
	}
	const partial = value["partial"];
	if (!isRecord(partial)) {
		return undefined;
	}
	const content = partial["content"];
	const contentIndex = value["contentIndex"];
	if (Array.isArray(content) && typeof contentIndex === "number" && Number.isInteger(contentIndex)) {
		const block = content[contentIndex];
		const phase = phaseFromTextBlock(block);
		if (phase !== undefined) {
			return phase;
		}
	}
	return summaryPhaseFromAssistantPartial(partial);
};

export type FlowProgressEvent =
	| { readonly _tag: "tool_start"; readonly toolName: string; readonly detail: string }
	| { readonly _tag: "tool_end"; readonly toolName: string; readonly detail: string }
	| { readonly _tag: "assistant_text"; readonly detail: string }
	| { readonly _tag: "summary_state"; readonly active: boolean; readonly source: "explicit" }
	| { readonly _tag: "budget_warning"; readonly detail: string };

const FLOW_CANCELLED_REASON = "Flow cancelled.";

const cancelledError = (): FlowCancelledError =>
	new FlowCancelledError({ reason: FLOW_CANCELLED_REASON });

const DIAGNOSTIC_FIELD_LIMIT = 160;
const DIAGNOSTIC_TEXT_LIMIT = 1800;

const clipDiagnostic = (value: string | undefined, max = DIAGNOSTIC_FIELD_LIMIT): string | undefined => {
	if (value === undefined) {
		return undefined;
	}
	const normalized = value.trim();
	if (normalized.length === 0) {
		return undefined;
	}
	return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
};

const summarizeAssistantEvent = (event: FlowProgressEvent): string => {
	switch (event._tag) {
		case "tool_start":
		case "tool_end":
			return `${event._tag}: ${event.toolName}${event.detail.length > 0 ? ` · ${clipDiagnostic(event.detail) ?? ""}` : ""}`.trim();
		case "assistant_text":
			return `assistant_text: ${clipDiagnostic(event.detail) ?? ""}`.trim();
		case "summary_state":
			return event.active ? "summary_state: active" : "summary_state: inactive";
		case "budget_warning":
			return `budget_warning: ${clipDiagnostic(event.detail) ?? ""}`.trim();
	}
};

// ── Watchdog configuration ────────────────────────────────────────────────────

export const DEFAULT_SUMMARY_IDLE_MS = 60_000;
export const DEFAULT_STREAM_IDLE_MS = 180_000;
export const DEFAULT_SUMMARY_FINALIZE_GRACE_MS = 4_000;
export const WATCHDOG_TICK_MS = 1_000;
export const PARTIAL_OUTPUT_PREFIX = "[flow-system partial:";

export interface WatchdogOptions {
	/** Max ms in summary phase with no new progress events before the child is killed. 0 disables. */
	summaryIdleMs?: number;
	/** Max ms with no JSON event from the child before the child is killed. 0 disables. */
	streamIdleMs?: number;
	/** Max ms to wait after final-answer text stops changing before treating it as complete. 0 disables. */
	summaryFinalizeGraceMs?: number;
	/** Hard cap on observed tool calls. 0 disables. */
	maxToolCalls?: number;
	/** Hard cap on wall-clock runtime in ms. 0 disables. */
	maxRuntimeMs?: number;
	/** Soft wall-clock warning in ms. Emits budget_warning once. 0 disables. */
	runtimeWarningMs?: number;
}

const parsePositiveIntEnv = (key: string): number | undefined => {
	const raw = process.env[key];
	if (raw === undefined || raw.length === 0) return undefined;
	const n = Number.parseInt(raw, 10);
	if (!Number.isFinite(n) || n < 0) return undefined;
	return n;
};

const resolveWatchdog = (opts: WatchdogOptions | undefined): Required<WatchdogOptions> => ({
	summaryIdleMs:
		opts?.summaryIdleMs ??
		parsePositiveIntEnv("FLOW_SYSTEM_SUMMARY_IDLE_MS") ??
		DEFAULT_SUMMARY_IDLE_MS,
	streamIdleMs:
		opts?.streamIdleMs ?? parsePositiveIntEnv("FLOW_SYSTEM_STREAM_IDLE_MS") ?? DEFAULT_STREAM_IDLE_MS,
	summaryFinalizeGraceMs:
		opts?.summaryFinalizeGraceMs ??
		parsePositiveIntEnv("FLOW_SYSTEM_SUMMARY_FINALIZE_GRACE_MS") ??
		DEFAULT_SUMMARY_FINALIZE_GRACE_MS,
	maxToolCalls: opts?.maxToolCalls ?? parsePositiveIntEnv("FLOW_SYSTEM_MAX_TOOL_CALLS") ?? 0,
	maxRuntimeMs: opts?.maxRuntimeMs ?? parsePositiveIntEnv("FLOW_SYSTEM_MAX_RUNTIME_MS") ?? 0,
	runtimeWarningMs:
		opts?.runtimeWarningMs ?? parsePositiveIntEnv("FLOW_SYSTEM_RUNTIME_WARNING_MS") ?? 0,
});

const failIfAborted = (signal: AbortSignal | undefined): Effect.Effect<void, FlowCancelledError> =>
	signal?.aborted ? Effect.fail(cancelledError()) : Effect.void;

export function extractAssistantMessageText(v: unknown): string | undefined {
	if (typeof v !== "object" || v === null) return undefined;
	const obj = v as Record<string, unknown>;
	const type = obj["type"];
	if (type !== "message_update" && type !== "message_end") {
		return undefined;
	}
	const message = obj["message"] as Record<string, unknown> | undefined;
	if (message?.["role"] !== "assistant") return undefined;
	const content = message["content"] as ReadonlyArray<Record<string, unknown>> | undefined;
	if (!Array.isArray(content)) return undefined;
	const texts = content
		.filter((c) => c["type"] === "text" && typeof c["text"] === "string")
		.map((c) => c["text"] as string)
		.filter(Boolean);
	return texts.length > 0 ? texts.join("\n").trim() : undefined;
}

function extractText(v: unknown): string | undefined {
	if (typeof v !== "object" || v === null) return undefined;
	const obj = v as Record<string, unknown>;

	if (obj["type"] === "agent_end") {
		const messages = obj["messages"];
		if (!Array.isArray(messages)) return undefined;
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i];
			if (msg?.role !== "assistant") continue;
			if (!msg.content) continue;
			const contentArr: ReadonlyArray<PiContentText | { type: string }> = msg.content;
			const texts = contentArr
				.filter((c): c is PiContentText => c.type === "text" && "text" in c)
				.map((c) => c.text)
				.filter(Boolean);
			if (texts.length > 0) return texts.join("\n");
		}
		return undefined;
	}

	if (obj["type"] === "message_end") {
		const message = obj["message"] as Record<string, unknown> | undefined;
		if (message?.["role"] !== "assistant") return undefined;
		const content = message["content"] as ReadonlyArray<Record<string, unknown>> | undefined;
		if (!Array.isArray(content)) return undefined;
		const texts = content
			.filter((c) => c["type"] === "text" && typeof c["text"] === "string")
			.map((c) => c["text"] as string)
			.filter(Boolean);
		return texts.length > 0 ? texts.join("\n") : undefined;
	}

	return undefined;
}

export function extractProgressEvent(v: unknown): FlowProgressEvent | undefined {
	if (typeof v !== "object" || v === null) return undefined;
	const obj = v as Record<string, unknown>;

	const readSummarySignal = (value: Record<string, unknown>): boolean | undefined => {
		const directKeys = [
			"writing_summary",
			"writingSummary",
			"isWritingSummary",
			"summary_phase",
			"summaryPhase",
			"final_summary",
			"finalSummary",
		] as const;
		for (const key of directKeys) {
			const raw = value[key];
			if (typeof raw === "boolean") {
				return raw;
			}
		}
		const typeRaw = value["type"];
		if (typeof typeRaw === "string") {
			const type = typeRaw.toLowerCase();
			if (
				type === "writing_summary" ||
				type === "writing-summary" ||
				type === "summary_phase_start" ||
				type === "summary-phase-start" ||
				type === "final_summary_start" ||
				type === "final-summary-start"
			) {
				return true;
			}
			if (
				type === "writing_summary_end" ||
				type === "writing-summary-end" ||
				type === "summary_phase_end" ||
				type === "summary-phase-end" ||
				type === "final_summary_end" ||
				type === "final-summary-end"
			) {
				return false;
			}
		}
		return undefined;
	};

	const summarySignal = readSummarySignal(obj);
	if (summarySignal !== undefined) {
		return { _tag: "summary_state", active: summarySignal, source: "explicit" };
	}
	const metaRaw = obj["meta"];
	if (typeof metaRaw === "object" && metaRaw !== null && !Array.isArray(metaRaw)) {
		const nestedSummarySignal = readSummarySignal(metaRaw as Record<string, unknown>);
		if (nestedSummarySignal !== undefined) {
			return { _tag: "summary_state", active: nestedSummarySignal, source: "explicit" };
		}
	}
	const assistantMessageEventPhase = summaryPhaseFromAssistantMessageEvent(obj["assistantMessageEvent"]);
	if (assistantMessageEventPhase === "final_answer") {
		return { _tag: "summary_state", active: true, source: "explicit" };
	}
	const messagePhase = summaryPhaseFromAssistantPartial(obj["message"]);
	if (messagePhase === "final_answer") {
		return { _tag: "summary_state", active: true, source: "explicit" };
	}

	const type = obj["type"];
	if (type === "tool_execution_start" || type === "tool_execution_end") {
		const toolNameRaw = obj["toolName"];
		const toolName = typeof toolNameRaw === "string" && toolNameRaw.length > 0 ? toolNameRaw : "tool";
		if (type === "tool_execution_start") {
			return { _tag: "tool_start", toolName, detail: `${toolName}…` };
		}
		return { _tag: "tool_end", toolName, detail: `${toolName} done` };
	}
	if (type === "message_update") {
		const message = obj["message"] as Record<string, unknown> | undefined;
		if (message?.["role"] !== "assistant") {
			return undefined;
		}
		const content = message["content"] as ReadonlyArray<Record<string, unknown>> | undefined;
		if (!Array.isArray(content)) {
			return undefined;
		}
		const text = content
			.filter((part) => part["type"] === "text" && typeof part["text"] === "string")
			.map((part) => part["text"] as string)
			.join("\n")
			.trim();
		if (text.length === 0) {
			return undefined;
		}
		return { _tag: "assistant_text", detail: text };
	}
	return undefined;
}

export const runSubprocess = (
	task: string,
	profile: FlowProfile,
	skillFile: string | undefined,
	systemPrompt: string | undefined,
	reasoning: ReasoningLevel | undefined,
	model: string | undefined,
	provider: string | undefined,
	cwd: string,
	onProgress?: (event: FlowProgressEvent) => void,
	abortSignal?: AbortSignal,
	watchdog?: WatchdogOptions,
): Effect.Effect<string, SubprocessError | FlowCancelledError> =>
	Effect.callback<string, SubprocessError | FlowCancelledError>((resume, effectSignal) => {
		const { summaryIdleMs, streamIdleMs, summaryFinalizeGraceMs, maxToolCalls, maxRuntimeMs, runtimeWarningMs } = resolveWatchdog(watchdog);
		const MAX_STDERR_BYTES = 64 * 1024;
		const args: string[] = ["--mode", "json", "-p", "--no-session"];
		const reasoningLevel = reasoning ?? profile.reasoning_level;
		let resolvedModel: string | undefined;

		args.push("--thinking", reasoningLevel);

		if (model !== undefined && model.length > 0) {
			resolvedModel =
				provider !== undefined && provider.length > 0 && !model.includes("/")
					? `${provider}/${model}`
					: model;
			args.push("--model", resolvedModel);
		} else if (provider !== undefined && provider.length > 0) {
			args.push("--provider", provider);
		}

		const tools = resolveToolsets(profile.toolsets);
		if (tools.length > 0) {
			args.push("--tools", tools.join(","));
		}

		if (skillFile !== undefined) {
			args.push("--append-system-prompt", skillFile);
		}

		if (profile.system_prompt_prefix !== undefined) {
			args.push("--system-prompt", profile.system_prompt_prefix);
		}
		if (systemPrompt !== undefined && systemPrompt.length > 0) {
			args.push("--append-system-prompt", systemPrompt);
		}

		const bin = process.argv[1] ?? "pi";
		const diagnosticCommand = [
			bin,
			"--mode json",
			"-p",
			"--no-session",
			`--thinking ${reasoningLevel}`,
			resolvedModel !== undefined ? `--model ${resolvedModel}` : undefined,
			resolvedModel === undefined && provider !== undefined && provider.length > 0 ? `--provider ${provider}` : undefined,
			tools.length > 0 ? `--tools ${tools.join(",")}` : undefined,
			skillFile !== undefined ? "--append-system-prompt [skill file]" : undefined,
			profile.system_prompt_prefix !== undefined ? "--system-prompt [redacted]" : undefined,
			systemPrompt !== undefined && systemPrompt.length > 0 ? "--append-system-prompt [redacted]" : undefined,
			"[task redacted]",
		]
			.filter((part): part is string => part !== undefined)
			.join(" ");

		args.push(task);
		let child: ReturnType<typeof spawn> | undefined;
		let rl: readline.Interface | undefined;
		let finished = false;
		let cancelled = false;
		let killTimer: ReturnType<typeof setTimeout> | undefined;
		let watchdogTimer: ReturnType<typeof setInterval> | undefined;
		let watchdogReason: string | undefined;

		let lastText = "";
		let lastAssistantText = "";
		let lastJsonEventType: string | undefined;
		let lastEventSummary: string | undefined;
		let stderrBuf = "";
		let stderrTruncated = false;

		let lastActivityAt = Date.now();
		let summaryActiveSince: number | undefined;
		let summaryFinalTextAt: number | undefined;
		const startedAt = Date.now();
		let observedToolCalls = 0;
		let runtimeWarningEmitted = false;

		const buildFailureStderr = (exitCode: number, signal: string | undefined): string => {
			if (cappedStderr().trim().length > 0) {
				return cappedStderr();
			}
			const lines: Array<string | undefined> = [
				"[flow-system] child exited without stderr",
				`exitCode: ${exitCode}`,
				signal !== undefined ? `signal: ${signal}` : undefined,
				`profile: ${profile.name}`,
				`reasoning: ${reasoningLevel}`,
				`model: ${resolvedModel ?? "(default)"}`,
				`provider: ${provider !== undefined && provider.length > 0 ? provider : "(default)"}`,
				`cwd: ${cwd}`,
				`command: ${diagnosticCommand}`,
				watchdogReason !== undefined ? `watchdog: ${watchdogReason}` : undefined,
				lastJsonEventType !== undefined ? `last json event: ${clipDiagnostic(lastJsonEventType)}` : undefined,
				lastEventSummary !== undefined ? `last event: ${clipDiagnostic(lastEventSummary)}` : undefined,
				lastText.length > 0 && lastText !== lastAssistantText ? `last text: ${clipDiagnostic(lastText)}` : undefined,
				lastAssistantText.length > 0 ? `last assistant text: ${clipDiagnostic(lastAssistantText)}` : undefined,
			];
			const text = lines.filter((line): line is string => line !== undefined).join("\n");
			return text.length > DIAGNOSTIC_TEXT_LIMIT ? `${text.slice(0, DIAGNOSTIC_TEXT_LIMIT)}…` : text;
		};

		const finish = (effect: Effect.Effect<string, SubprocessError | FlowCancelledError>): void => {
			if (finished) return;
			finished = true;
			if (killTimer !== undefined) {
				clearTimeout(killTimer);
				killTimer = undefined;
			}
			if (watchdogTimer !== undefined) {
				clearInterval(watchdogTimer);
				watchdogTimer = undefined;
			}
			effectSignal.removeEventListener("abort", onAbort);
			abortSignal?.removeEventListener("abort", onAbort);
			rl?.close();
			resume(effect);
		};

		const cappedStderr = (): string =>
			stderrTruncated ? `${stderrBuf}\n...[truncated]` : stderrBuf;

		const terminateChild = (): void => {
			if (child === undefined || child.exitCode !== null) return;
			child.kill("SIGTERM");
			killTimer = setTimeout(() => {
				if (!finished && child !== undefined && child.exitCode === null) {
					child.kill("SIGKILL");
				}
			}, 1500);
		};

		const triggerWatchdog = (reason: string): void => {
			if (watchdogReason !== undefined) return;
			watchdogReason = reason;
			if (watchdogTimer !== undefined) {
				clearInterval(watchdogTimer);
				watchdogTimer = undefined;
			}
			terminateChild();
		};

		const onAbort = (): void => {
			cancelled = true;
			terminateChild();
		};

		const checkWatchdog = (): void => {
			if (finished || cancelled || watchdogReason !== undefined) return;
			const now = Date.now();
			if (runtimeWarningMs > 0 && !runtimeWarningEmitted && now - startedAt >= runtimeWarningMs) {
				runtimeWarningEmitted = true;
				onProgress?.({ _tag: "budget_warning", detail: `runtime warning ${runtimeWarningMs}ms: request checkpoint/summary` });
			}
			if (maxRuntimeMs > 0 && now - startedAt >= maxRuntimeMs) {
				triggerWatchdog(`runtime-cap ${maxRuntimeMs}ms`);
				return;
			}
			if (streamIdleMs > 0 && now - lastActivityAt >= streamIdleMs) {
				triggerWatchdog(`stream-idle ${streamIdleMs}ms`);
				return;
			}
			if (
				summaryFinalizeGraceMs > 0 &&
				summaryActiveSince !== undefined &&
				summaryFinalTextAt !== undefined &&
				lastAssistantText.length > 0 &&
				now - summaryFinalTextAt >= summaryFinalizeGraceMs
			) {
				triggerWatchdog(`summary-complete ${summaryFinalizeGraceMs}ms`);
				return;
			}
			if (
				summaryIdleMs > 0 &&
				summaryActiveSince !== undefined &&
				now - Math.max(summaryActiveSince, lastActivityAt) >= summaryIdleMs
			) {
				triggerWatchdog(`summary-idle ${summaryIdleMs}ms`);
			}
		};

		if (abortSignal?.aborted || effectSignal.aborted) {
			finish(Effect.fail(cancelledError()));
			return;
		}

		try {
			child = spawn(bin, args, {
				stdio: ["ignore", "pipe", "pipe"],
				cwd,
			});
		} catch (error) {
			const stderr = error instanceof Error ? error.message.trim() : String(error).trim();
			finish(
				Effect.fail(
					new SubprocessError({
						exitCode: 1,
						stderr: stderr.length > 0 ? stderr : buildFailureStderr(1, undefined),
					}),
				),
			);
			return;
		}

		if (child === undefined) {
			finish(Effect.fail(new SubprocessError({ exitCode: 1, stderr: "Failed to spawn process" })));
			return;
		}

		const proc = child;
		if (proc.stdout === null || proc.stderr === null) {
			finish(
				Effect.fail(
					new SubprocessError({
						exitCode: 1,
						stderr: "Failed to capture subprocess stdio streams",
					}),
				),
			);
			return;
		}
		rl = readline.createInterface({ input: proc.stdout });
		effectSignal.addEventListener("abort", onAbort, { once: true });
		abortSignal?.addEventListener("abort", onAbort, { once: true });

		if (summaryIdleMs > 0 || streamIdleMs > 0 || maxRuntimeMs > 0 || runtimeWarningMs > 0) {
			watchdogTimer = setInterval(checkWatchdog, WATCHDOG_TICK_MS);
			// Allow the node process to exit even if the interval is live.
			if (typeof (watchdogTimer as { unref?: () => void }).unref === "function") {
				(watchdogTimer as { unref: () => void }).unref();
			}
		}

		rl.on("line", (line) => {
			lastActivityAt = Date.now();
			try {
				const msg: unknown = JSON.parse(line);
				if (isRecord(msg) && typeof msg["type"] === "string") {
					lastJsonEventType = msg["type"];
				}
				const text = extractText(msg);
				if (text !== undefined) {
					lastText = text;
					lastEventSummary = `text: ${clipDiagnostic(text) ?? ""}`.trim();
				}
				const assistantText = extractAssistantMessageText(msg);
				if (assistantText !== undefined && assistantText.length > 0) {
					if (assistantText !== lastAssistantText) {
						lastAssistantText = assistantText;
						summaryFinalTextAt = lastActivityAt;
					} else if (summaryFinalTextAt === undefined) {
						summaryFinalTextAt = lastActivityAt;
					}
					lastEventSummary = `assistant_text: ${clipDiagnostic(assistantText) ?? ""}`.trim();
				}
				const progress = extractProgressEvent(msg);
				if (progress !== undefined) {
					lastEventSummary = summarizeAssistantEvent(progress);
					if (progress._tag === "summary_state") {
						if (progress.active) {
							if (summaryActiveSince === undefined) {
								summaryActiveSince = lastActivityAt;
							}
						} else {
							summaryActiveSince = undefined;
							summaryFinalTextAt = undefined;
						}
					} else if (progress._tag === "tool_start" || progress._tag === "tool_end") {
						summaryActiveSince = undefined;
						summaryFinalTextAt = undefined;
						if (progress._tag === "tool_start") {
							observedToolCalls += 1;
							if (maxToolCalls > 0 && observedToolCalls > maxToolCalls) {
								triggerWatchdog(`tool-cap ${maxToolCalls}`);
								return;
							}
						}
					} else if (progress._tag === "assistant_text") {
						lastAssistantText = progress.detail;
						if (summaryActiveSince !== undefined) {
							summaryFinalTextAt = lastActivityAt;
						}
					}
					onProgress?.(progress);
				}
			} catch {
				// non-JSON stdout lines — skip
			}
		});

		proc.stderr.on("data", (chunk: Buffer) => {
			lastActivityAt = Date.now();
			const text = chunk.toString();
			if (stderrBuf.length >= MAX_STDERR_BYTES) {
				stderrTruncated = true;
				return;
			}
			const remaining = MAX_STDERR_BYTES - stderrBuf.length;
			stderrBuf += text.slice(0, remaining);
			if (text.length > remaining) {
				stderrTruncated = true;
			}
		});

		proc.on("error", (error: Error) => {
			if (cancelled || abortSignal?.aborted || effectSignal.aborted) {
				finish(Effect.fail(cancelledError()));
				return;
			}
			const stderr = `${cappedStderr()}\n${error.message}`.trim();
			finish(
				Effect.fail(
					new SubprocessError({
						exitCode: 1,
						stderr: stderr.length > 0 ? stderr : buildFailureStderr(1, undefined),
					}),
				),
			);
		});

		proc.on("close", (code, signal) => {
			if (cancelled || abortSignal?.aborted || effectSignal.aborted) {
				finish(Effect.fail(cancelledError()));
				return;
			}
			if (watchdogReason !== undefined) {
				const fallback = lastText.length > 0 ? lastText : lastAssistantText;
				if (fallback.length > 0) {
					if (watchdogReason.startsWith("summary-complete ")) {
						finish(Effect.succeed(fallback));
						return;
					}
					finish(
						Effect.succeed(`${PARTIAL_OUTPUT_PREFIX}${watchdogReason}]\n${fallback}`),
					);
					return;
				}
				const watchdogStderr = buildFailureStderr(code ?? 1, signal ?? undefined);
				finish(
					Effect.fail(
						new SubprocessError({ exitCode: code ?? 1, stderr: watchdogStderr }),
					),
				);
				return;
			}
			if (code === 0) {
				const resolved = lastText.length > 0 ? lastText : lastAssistantText;
				finish(Effect.succeed(resolved));
			} else {
				const stderr = buildFailureStderr(code ?? 1, signal ?? undefined);
				finish(
					Effect.fail(
						new SubprocessError({ exitCode: code ?? 1, stderr }),
					),
				);
			}
		});

		// Return cleanup effect — called on interruption
		return Effect.sync(() => {
			if (!finished) {
				onAbort();
			}
		});
	});

// ── High-level executor ───────────────────────────────────────────────────────

export interface ExecuteOptions {
	task: string;
	profile: FlowProfile;
	reasoning?: ReasoningLevel | undefined;
	model?: string | undefined;
	provider?: string | undefined;
	systemPrompt?: string | undefined;
	cwd?: string | undefined;
	onProgress?: (event: FlowProgressEvent) => void;
	signal?: AbortSignal | undefined;
	onModelFallback?: () => void;
	onAgentPromptUnavailable?: () => void;
	watchdog?: WatchdogOptions;
}

export const executeFlow = ({
	task,
	profile,
	reasoning,
	model,
	provider,
	systemPrompt,
	cwd = process.cwd(),
	onProgress,
	signal,
	watchdog,
	onModelFallback: _onModelFallback,
	onAgentPromptUnavailable: _onAgentPromptUnavailable,
}: ExecuteOptions): Effect.Effect<string, SubprocessError | SkillLoadError | FlowCancelledError> => {
	const hasSkills = profile.skills.length > 0;

	if (!hasSkills) {
		return failIfAborted(signal).pipe(
			Effect.flatMap(() =>
				runSubprocess(
					task,
					profile,
					undefined,
					systemPrompt,
					reasoning,
					model,
					provider,
					cwd,
					onProgress,
					signal,
					watchdog,
				),
			),
		);
	}

	return failIfAborted(signal).pipe(
		Effect.flatMap(() =>
			Effect.acquireUseRelease(
				// Acquire: stage skills → write temp file → return path
				stageSkills(profile.skills, cwd).pipe(
					Effect.flatMap((content) => writeTempSkillFile(content)),
				),
				// Use: run subprocess with skill file
				(skillFile) =>
					runSubprocess(
						task,
						profile,
						skillFile,
						systemPrompt,
						reasoning,
						model,
						provider,
						cwd,
						onProgress,
						signal,
						watchdog,
					),
				// Release: always clean up, even on failure or interruption
				(skillFile) => cleanupTempFile(skillFile),
			),
		),
	);
};

export const executeFlowToText = (opts: ExecuteOptions): Promise<string> =>
	Effect.runPromiseExit(executeFlow(opts)).then((exit) =>
		Exit.match(exit, {
			onSuccess: (text) => text || "(no output)",
			onFailure: (cause) => `Flow failed: ${formatFlowError(cause)}`,
		}),
	);
