import { describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Effect } from "effect";
import { extractAssistantMessageText, extractProgressEvent, runSubprocess } from "../src/executor.js";
import { SubprocessError, type FlowProfile } from "../src/types.js";

const signature = (phase: "commentary" | "final_answer"): string =>
	JSON.stringify({ v: 1, id: "msg_1", phase });

const PROFILE: FlowProfile = {
	name: "test",
	reasoning_level: "low",
	toolsets: [],
	skills: [],
};

const withProcessArgvBin = async <T>(bin: string, run: () => Promise<T>): Promise<T> => {
	const previous = process.argv[1] ?? "";
	process.argv[1] = bin;
	try {
		return await run();
	} finally {
		process.argv[1] = previous;
	}
};

describe("runSubprocess", () => {
	it("fails when observed tool calls exceed maxToolCalls", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-budget-"));
		const script = path.join(tempDir, "fake-pi.mjs");
		await fs.writeFile(
			script,
			[
				"#!/usr/bin/env bun",
				"console.log(JSON.stringify({ type: 'tool_execution_start', toolName: 'read' }));",
				"console.log(JSON.stringify({ type: 'tool_execution_start', toolName: 'bash' }));",
				"setTimeout(() => {}, 5000);",
			].join("\n"),
			"utf8",
		);
		await fs.chmod(script, 0o755);
		try {
			await expect(
				withProcessArgvBin(script, () =>
					Effect.runPromise(
						runSubprocess(
							"ignored",
							PROFILE,
							undefined,
							undefined,
							"low",
							undefined,
							undefined,
							tempDir,
							undefined,
							undefined,
							{ maxToolCalls: 1, streamIdleMs: 0, summaryIdleMs: 0, summaryFinalizeGraceMs: 0 },
						),
					),
				),
			).rejects.toBeInstanceOf(SubprocessError);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});

describe("extractProgressEvent", () => {
	it("emits explicit summary_state when assistantMessageEvent carries final_answer signature", () => {
		const event = extractProgressEvent({
			type: "message_update",
			message: {
				role: "assistant",
				content: [{ type: "text", text: "Final answer draft", textSignature: signature("final_answer") }],
			},
			assistantMessageEvent: {
				type: "text_end",
				contentIndex: 0,
				content: "Final answer draft",
				partial: {
					role: "assistant",
					content: [{ type: "text", text: "Final answer draft", textSignature: signature("final_answer") }],
				},
			},
		});

		expect(event).toEqual({
			_tag: "summary_state",
			active: true,
			source: "explicit",
		});
	});

	it("preserves assistant_text for commentary signature updates", () => {
		const event = extractProgressEvent({
			type: "message_update",
			message: {
				role: "assistant",
				content: [{ type: "text", text: "Working notes", textSignature: signature("commentary") }],
			},
			assistantMessageEvent: {
				type: "text_end",
				contentIndex: 0,
				content: "Working notes",
				partial: {
					role: "assistant",
					content: [{ type: "text", text: "Working notes", textSignature: signature("commentary") }],
				},
			},
		});

		expect(event).toEqual({
			_tag: "assistant_text",
			detail: "Working notes",
		});
	});

	it("emits explicit summary_state false for dedicated summary end hooks", () => {
		const event = extractProgressEvent({
			type: "writing_summary_end",
			message: {
				role: "assistant",
				content: [{ type: "text", text: "Working notes" }],
			},
		});

		expect(event).toEqual({
			_tag: "summary_state",
			active: false,
			source: "explicit",
		});
	});

	it("falls back to assistant_text when no explicit summary signature is present", () => {
		const event = extractProgressEvent({
			type: "message_update",
			message: {
				role: "assistant",
				content: [{ type: "text", text: "Still working..." }],
			},
			assistantMessageEvent: {
				type: "text_delta",
				contentIndex: 0,
				delta: "Still working...",
				partial: {
					role: "assistant",
					content: [{ type: "text", text: "Still working..." }],
				},
			},
		});

		expect(event).toEqual({
			_tag: "assistant_text",
			detail: "Still working...",
		});
	});

	it("extracts assistant text from final_answer message updates even when progress becomes summary_state", () => {
		const text = extractAssistantMessageText({
			type: "message_update",
			message: {
				role: "assistant",
				content: [{ type: "text", text: "SUCCESS extensions/flow-system/src/status-tool.ts", textSignature: signature("final_answer") }],
			},
			assistantMessageEvent: {
				type: "text_end",
				contentIndex: 0,
				content: "SUCCESS extensions/flow-system/src/status-tool.ts",
				partial: {
					role: "assistant",
					content: [{ type: "text", text: "SUCCESS extensions/flow-system/src/status-tool.ts", textSignature: signature("final_answer") }],
				},
			},
		});

		expect(text).toBe("SUCCESS extensions/flow-system/src/status-tool.ts");
	});
});
