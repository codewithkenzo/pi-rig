import { Effect, Exit, Cause } from "effect";
import { spawn } from "node:child_process";
import * as readline from "node:readline";
import { stageSkills, writeTempSkillFile, cleanupTempFile } from "./vfs.js";
import type { FlowProfile } from "./types.js";
import { SubprocessError, SkillLoadError } from "./types.js";

// ── Pi JSON message type ──────────────────────────────────────────────────────

interface PiMessageEnd {
	type: "message_end";
	text: string;
}

function isPiMessageEnd(v: unknown): v is PiMessageEnd {
	return (
		typeof v === "object" &&
		v !== null &&
		(v as Record<string, unknown>)["type"] === "message_end" &&
		typeof (v as Record<string, unknown>)["text"] === "string"
	);
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
): Effect.Effect<string, SubprocessError> =>
	Effect.async<string, SubprocessError>((resume) => {
		const args: string[] = ["--mode", "json", "-p", "--no-session"];

		// Thinking level
		const level = profile.reasoning_level === "xhigh" ? "xhigh" : profile.reasoning_level;
		args.push("--thinking-level", level);

		// Max iterations
		args.push("--max-iterations", String(profile.max_iterations));

		// Toolsets
		if (profile.toolsets.length > 0) {
			args.push("--tools", profile.toolsets.join(","));
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

		const child = spawn(bin, args, {
			stdio: ["ignore", "pipe", "pipe"],
			cwd,
		});

		let lastText = "";
		let stderrBuf = "";

		const rl = readline.createInterface({ input: child.stdout });

		rl.on("line", (line) => {
			try {
				const msg: unknown = JSON.parse(line);
				if (isPiMessageEnd(msg)) lastText = msg.text;
			} catch {
				// non-JSON stdout lines — skip
			}
		});

		child.stderr?.on("data", (chunk: Buffer) => {
			stderrBuf += chunk.toString();
		});

		child.on("close", (code) => {
			rl.close();
			if (code === 0) {
				resume(Effect.succeed(lastText));
			} else {
				resume(
					Effect.fail(
						new SubprocessError({ exitCode: code ?? 1, stderr: stderrBuf }),
					),
				);
			}
		});

		// Return cleanup effect — called on interruption
		return Effect.sync(() => {
			child.kill();
		});
	});

// ── High-level executor ───────────────────────────────────────────────────────

export interface ExecuteOptions {
	task: string;
	profile: FlowProfile;
	cwd?: string | undefined;
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
}: ExecuteOptions): Effect.Effect<string, SubprocessError | SkillLoadError> => {
	const hasSkills = profile.skills.length > 0;

	if (!hasSkills) {
		return runSubprocess(task, profile, undefined, cwd);
	}

	return Effect.acquireUseRelease(
		// Acquire: stage skills → write temp file → return path
		stageSkills(profile.skills).pipe(
			Effect.flatMap((content) => writeTempSkillFile(content)),
		),
		// Use: run subprocess with skill file
		(skillFile) => runSubprocess(task, profile, skillFile, cwd),
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
