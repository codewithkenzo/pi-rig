import { Effect, Exit, Cause } from "effect";
import { spawn } from "node:child_process";
import * as readline from "node:readline";
import { stageSkills, writeTempSkillFile, cleanupTempFile } from "./vfs.js";
import type { FlowProfile, ReasoningLevel } from "./types.js";
import { FlowCancelledError, SubprocessError, SkillLoadError } from "./types.js";

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


export type FlowProgressEvent =
	| { readonly _tag: "tool_start"; readonly toolName: string; readonly detail: string }
	| { readonly _tag: "tool_end"; readonly toolName: string; readonly detail: string }
	| { readonly _tag: "assistant_text"; readonly detail: string };

const FLOW_CANCELLED_REASON = "Flow cancelled.";

const cancelledError = (): FlowCancelledError =>
	new FlowCancelledError({ reason: FLOW_CANCELLED_REASON });

const failIfAborted = (signal: AbortSignal | undefined): Effect.Effect<void, FlowCancelledError> =>
	signal?.aborted ? Effect.fail(cancelledError()) : Effect.void;

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

function extractProgressEvent(v: unknown): FlowProgressEvent | undefined {
	if (typeof v !== "object" || v === null) return undefined;
	const obj = v as Record<string, unknown>;
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
): Effect.Effect<string, SubprocessError | FlowCancelledError> =>
	Effect.callback<string, SubprocessError | FlowCancelledError>((resume, effectSignal) => {
		const MAX_STDERR_BYTES = 64 * 1024;
		const args: string[] = ["--mode", "json", "-p", "--no-session"];

		args.push("--thinking", reasoning ?? profile.reasoning_level);

		if (model !== undefined && model.length > 0) {
			const resolvedModel =
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

		args.push(task);

		const bin = process.argv[1] ?? "pi";
		let child: ReturnType<typeof spawn> | undefined;
		let rl: readline.Interface | undefined;
		let finished = false;
		let cancelled = false;
		let killTimer: ReturnType<typeof setTimeout> | undefined;

		let lastText = "";
		let stderrBuf = "";
		let stderrTruncated = false;

		const finish = (effect: Effect.Effect<string, SubprocessError | FlowCancelledError>): void => {
			if (finished) return;
			finished = true;
			if (killTimer !== undefined) {
				clearTimeout(killTimer);
				killTimer = undefined;
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

		const onAbort = (): void => {
			cancelled = true;
			terminateChild();
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
			const stderr = error instanceof Error ? error.message : String(error);
			finish(Effect.fail(new SubprocessError({ exitCode: 1, stderr })));
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

		rl.on("line", (line) => {
			try {
				const msg: unknown = JSON.parse(line);
				const text = extractText(msg);
				if (text !== undefined) lastText = text;
				const progress = extractProgressEvent(msg);
				if (progress !== undefined) {
					onProgress?.(progress);
				}
			} catch {
				// non-JSON stdout lines — skip
			}
		});

		proc.stderr.on("data", (chunk: Buffer) => {
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
			finish(
				Effect.fail(
					new SubprocessError({
						exitCode: 1,
						stderr: `${cappedStderr()}\n${error.message}`.trim(),
					}),
				),
			);
		});

		proc.on("close", (code) => {
			if (cancelled || abortSignal?.aborted || effectSignal.aborted) {
				finish(Effect.fail(cancelledError()));
				return;
			}
			if (code === 0) {
				finish(Effect.succeed(lastText));
			} else {
				finish(
					Effect.fail(
						new SubprocessError({ exitCode: code ?? 1, stderr: cappedStderr() }),
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
			onFailure: (cause) => `Flow failed: ${Cause.pretty(cause)}`,
		}),
	);
