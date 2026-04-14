import { Effect, Exit, Cause } from "effect";
import { spawn } from "node:child_process";
import * as readline from "node:readline";
import { stageSkills, writeTempSkillFile, cleanupTempFile } from "./vfs.js";
import type { FlowProfile } from "./types.js";
import { SubprocessError, SkillLoadError } from "./types.js";

// ── Toolset → pi CLI tool mapping ────────────────────────────────────────────

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
		// unknown toolset names are silently skipped — pi will use defaults
	}
	return Array.from(tools);
}

// ── Pi JSON message types ─────────────────────────────────────────────────────

interface PiContentText {
	type: "text";
	text: string;
}

interface PiAgentEnd {
	type: "agent_end";
	messages: ReadonlyArray<{
		role: string;
		content: ReadonlyArray<PiContentText | { type: string }>;
	}>;
}

export type FlowProgressEvent =
	| { readonly _tag: "tool_start"; readonly toolName: string; readonly detail: string }
	| { readonly _tag: "tool_end"; readonly toolName: string; readonly detail: string };

/**
 * Extracts the final assistant text from a pi JSON event.
 *
 * Pi emits several event types; the most reliable for final output is `agent_end`
 * which contains the full conversation. We take the last assistant message's text.
 * Falls back to `message_end` events with assistant role.
 */
function extractText(v: unknown): string | undefined {
	if (typeof v !== "object" || v === null) return undefined;
	const obj = v as Record<string, unknown>;

	// agent_end — carries the full message history; last assistant text wins
	if (obj["type"] === "agent_end") {
		const messages = (obj as unknown as PiAgentEnd).messages;
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

	// message_end — has nested message.content[]
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
	if (type !== "tool_execution_start" && type !== "tool_execution_end") {
		return undefined;
	}

	const toolNameRaw = obj["toolName"];
	const toolName = typeof toolNameRaw === "string" && toolNameRaw.length > 0 ? toolNameRaw : "tool";
	if (type === "tool_execution_start") {
		return { _tag: "tool_start", toolName, detail: `${toolName}…` };
	}
	return { _tag: "tool_end", toolName, detail: `${toolName} done` };
}

// ── Subprocess runner ─────────────────────────────────────────────────────────

/**
 * Spawns a pi subprocess in JSON mode and resolves to the final message text.
 *
 * @param task            - The prompt to pass to pi
 * @param profile         - Flow profile to apply (thinking-level, toolsets)
 * @param skillFile       - Optional path to a staged skill file (--append-system-prompt)
 * @param cwd             - Working directory for the subprocess
 */
export const runSubprocess = (
	task: string,
	profile: FlowProfile,
	skillFile: string | undefined,
	cwd: string,
	onProgress?: (event: FlowProgressEvent) => void,
): Effect.Effect<string, SubprocessError> =>
	Effect.callback<string, SubprocessError>((resume, signal) => {
		const MAX_STDERR_BYTES = 64 * 1024;
		const args: string[] = ["--mode", "json", "-p", "--no-session"];

		// Thinking level
		args.push("--thinking", profile.reasoning_level);

		// Toolsets — map abstract names to pi CLI tool names
		const tools = resolveToolsets(profile.toolsets);
		if (tools.length > 0) {
			args.push("--tools", tools.join(","));
		}

		// System prompt prefix via skill file
		if (skillFile !== undefined) {
			args.push("--append-system-prompt", skillFile);
		}

		// System prompt prefix from profile
		if (profile.system_prompt_prefix !== undefined) {
			args.push("--system-prompt", profile.system_prompt_prefix);
		}

		// Task is the final positional argument
		args.push(task);

		const bin = process.argv[1] ?? "pi";
		let child: ReturnType<typeof spawn> | undefined;
		let rl: readline.Interface | undefined;
		let finished = false;
		let killTimer: ReturnType<typeof setTimeout> | undefined;

		let lastText = "";
		let stderrBuf = "";
		let stderrTruncated = false;

		const finish = (effect: Effect.Effect<string, SubprocessError>): void => {
			if (finished) return;
			finished = true;
			if (killTimer !== undefined) {
				clearTimeout(killTimer);
				killTimer = undefined;
			}
			signal.removeEventListener("abort", onAbort);
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

		const onAbort = () => {
			terminateChild();
		};

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
		signal.addEventListener("abort", onAbort, { once: true });

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
				terminateChild();
			}
		});
	});

// ── High-level executor ───────────────────────────────────────────────────────

export interface ExecuteOptions {
	task: string;
	profile: FlowProfile;
	cwd?: string | undefined;
	onProgress?: (event: FlowProgressEvent) => void;
}

/**
 * Full execution pipeline:
 *   1. Stage skill files from profile.skills (cached in-process)
 *   2. Write staged content to a temp file
 *   3. Run pi subprocess
 *   4. Clean up temp file (via acquireUseRelease — always runs)
 *
 * Returns the final text output from pi, or fails with SubprocessError | SkillLoadError.
 */
export const executeFlow = ({
	task,
	profile,
	cwd = process.cwd(),
	onProgress,
}: ExecuteOptions): Effect.Effect<string, SubprocessError | SkillLoadError> => {
	const hasSkills = profile.skills.length > 0;

	if (!hasSkills) {
		return runSubprocess(task, profile, undefined, cwd, onProgress);
	}

	return Effect.acquireUseRelease(
		// Acquire: stage skills → write temp file → return path
		stageSkills(profile.skills).pipe(
			Effect.flatMap((content) => writeTempSkillFile(content)),
		),
		// Use: run subprocess with skill file
		(skillFile) => runSubprocess(task, profile, skillFile, cwd, onProgress),
		// Release: always clean up, even on failure or interruption
		(skillFile) => cleanupTempFile(skillFile),
	);
};

// ── Convenience: run and format result ───────────────────────────────────────

/**
 * Runs executeFlow and converts Exit to a plain string result.
 * On success: returns the pi output text.
 * On failure: returns a formatted error string (does not throw).
 */
export const executeFlowToText = (opts: ExecuteOptions): Promise<string> =>
	Effect.runPromiseExit(executeFlow(opts)).then((exit) =>
		Exit.match(exit, {
			onSuccess: (text) => text || "(no output)",
			onFailure: (cause) => `Flow failed: ${Cause.pretty(cause)}`,
		}),
	);
