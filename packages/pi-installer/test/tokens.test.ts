import { describe, expect, it } from "bun:test";
import { fg } from "../src/tokens.js";

describe("fg", () => {
	it("wraps text with 24-bit ANSI color", () => {
		const result = fg("#FF0000", "hello");
		expect(result).toBe("\x1b[38;2;255;0;0mhello\x1b[39m");
	});

	it("handles hex without hash prefix", () => {
		const result = fg("00FF00", "green");
		expect(result).toBe("\x1b[38;2;0;255;0mgreen\x1b[39m");
	});

	it("returns plain text for invalid hex length", () => {
		expect(fg("#FFF", "short")).toBe("short");
		expect(fg("", "empty")).toBe("empty");
		expect(fg("#1234567", "long")).toBe("long");
	});

	it("parses Electric Midnight accent correctly", () => {
		const result = fg("#8B5CF6", "accent");
		expect(result).toContain("38;2;139;92;246");
	});
});
