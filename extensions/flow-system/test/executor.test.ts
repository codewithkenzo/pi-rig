import { describe, expect, it } from "bun:test";
import { extractProgressEvent } from "../src/executor.js";

const signature = (phase: "commentary" | "final_answer"): string =>
	JSON.stringify({ v: 1, id: "msg_1", phase });

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
});
