import { describe, expect, test } from "bun:test";
import { ellipsize, fitAnsiLine, visibleWidth } from "../ui/hud.js";

describe("hud width helpers", () => {
	test("counts emoji and CJK as wide", () => {
		expect(visibleWidth("✅")).toBe(2);
		expect(visibleWidth("日本")).toBe(4);
	});

	test("ellipsizes by visible width", () => {
		expect(visibleWidth(ellipsize("Done ✅ - `zig build`", 10))).toBeLessThanOrEqual(10);
	});

	test("fits ansi line within terminal width", () => {
		const line = "\x1b[32m↳ · Done. - `zig build -Dtarget=x86_64-linux-musl` ✅ - `zig build test`\x1b[0m";
		const fitted = fitAnsiLine(line, 62);
		expect(visibleWidth(fitted)).toBeLessThanOrEqual(62);
	});
});
