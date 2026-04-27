import { describe, it, expect } from "bun:test";
import { visibleWidth, truncateToWidth, fitAnsiColumn, zipColumns } from "../src/deck/layout.js";
import { computeDeckFrameLayout, padDeckFrame } from "../src/deck/frame.js";

describe("visibleWidth", () => {
	it("measures plain ASCII", () => {
		expect(visibleWidth("hello")).toBe(5);
	});

	it("returns 0 for empty string", () => {
		expect(visibleWidth("")).toBe(0);
	});

	it("strips ANSI before measuring", () => {
		expect(visibleWidth("\x1b[32mhello\x1b[0m")).toBe(5);
	});

	it("counts CJK chars as 2 columns", () => {
		// 日 is U+65E5, in CJK Unified (0x4e00–0x9fff)
		expect(visibleWidth("日")).toBe(2);
		expect(visibleWidth("日本")).toBe(4);
	});

	it("counts emoji graphemes as terminal cells", () => {
		expect(visibleWidth("🚀")).toBe(2);
		expect(visibleWidth("👨‍💻")).toBe(2);
		expect(visibleWidth("⚙️")).toBe(2);
		expect(visibleWidth("🇮🇹")).toBe(2);
		expect(visibleWidth("✓")).toBe(1);
		expect(visibleWidth("é")).toBe(1);
	});

	it("counts ASCII chars as 1", () => {
		expect(visibleWidth("abc")).toBe(3);
	});
});

describe("truncateToWidth", () => {
	it("pads short text to exact width with spaces", () => {
		const result = truncateToWidth("hi", 10);
		expect(result).toBe("hi        ");
		expect(result.length).toBe(10);
	});

	it("returns text padded to exact width when exactly right length", () => {
		const result = truncateToWidth("hello", 5);
		expect(result).toBe("hello");
		expect(result.length).toBe(5);
	});

	it("truncates long text with ellipsis", () => {
		const result = truncateToWidth("hello world extra text", 10);
		expect(result.length).toBe(10);
		expect(result).toContain("…");
	});

	it("strips ANSI when measuring and truncating", () => {
		const result = truncateToWidth("\x1b[32mhello\x1b[0m", 10);
		// plain "hello" = 5 chars, padded to 10
		expect(result).toBe("hello     ");
		expect(result.length).toBe(10);
	});

	it("handles empty string", () => {
		const result = truncateToWidth("", 5);
		expect(result).toBe("     ");
		expect(result.length).toBe(5);
	});

	it("fits wide emoji to exact visible width", () => {
		const result = truncateToWidth("status 🚀 👨‍💻 ⚙️ done", 16);
		expect(visibleWidth(result)).toBe(16);
		expect(result).toContain("…");
	});
});

describe("fitAnsiColumn", () => {
	it("fits ANSI and emoji without visible overflow", () => {
		const result = fitAnsiColumn("\x1b[32mtool 🚀 👨‍💻 ⚙️ complete\x1b[0m", 18);
		expect(visibleWidth(result)).toBe(18);
		expect(result).toContain("…");
	});

	it("normalizes tabs and newlines into printable row cells", () => {
		const result = fitAnsiColumn("one\ttwo\nthree", 20);
		expect(result).not.toContain("\t");
		expect(result).not.toContain("\n");
		expect(visibleWidth(result)).toBe(20);
	});

	it("strips OSC sequences while fitting", () => {
		const result = fitAnsiColumn("before\x1b]0;title\x07after", 20);
		expect(result).toContain("beforeafter");
		expect(result).not.toContain("\x1b]");
		expect(visibleWidth(result)).toBe(20);
	});
});

describe("padDeckFrame", () => {
	it("pads blank rows with spaces, not empty strings", () => {
		const rows = padDeckFrame(["one"], 4, 5);
		expect(rows).toHaveLength(4);
		expect(rows.slice(0, 3)).toEqual(["     ", "     ", "     "]);
		expect(rows[3]).toBe("one  ");
		expect(rows.every((row) => visibleWidth(row) === 5)).toBe(true);
	});

	it("fits every row to requested visible width", () => {
		const rows = padDeckFrame(["\x1b[32mabc\x1b[0m"], 1, 5);
		expect(rows).toHaveLength(1);
		expect(visibleWidth(rows[0] ?? "")).toBe(5);
	});
});

describe("computeDeckFrameLayout", () => {
	it("keeps stable section heights across compact and wide modes", () => {
		const wide = computeDeckFrameLayout(40, false);
		const compact = computeDeckFrameLayout(40, true);
		expect(wide.frameHeight).toBeGreaterThan(compact.frameHeight);
		expect(wide.columnsHeight + wide.summaryHeight + 6).toBe(wide.frameHeight);
		expect(compact.columnsHeight + compact.summaryHeight + 6).toBe(compact.frameHeight);
	});
});

describe("zipColumns — width safety", () => {
	it("merges equal-length columns at 96 cols", () => {
		const left = ["profile", "status", "tools", "started", "running", "task"];
		const right = ["event 1", "event 2", "event 3", "event 4", "event 5", "event 6"];
		const rows = zipColumns(left, right, 38, 96, " │ ");
		expect(rows).toHaveLength(6);
		rows.forEach((r) => {
			// Each row should be exactly leftWidth + sep + rightWidth = 38 + 3 + 55 = 96 chars
			// (sep = " │ " = 3 chars)
			expect(r.length).toBe(96);
		});
	});

	it("pads shorter column with empty lines at 60 cols", () => {
		const left = ["a"];
		const right = ["x", "y", "z"];
		const rows = zipColumns(left, right, 20, 60, "|");
		expect(rows).toHaveLength(3);
		// First row has content on both sides
		expect(rows[0]).toContain("a");
		expect(rows[0]).toContain("x");
		// Second row has empty left column padded
		expect(rows[1]).not.toContain("a");
	});

	it("renders at 120 cols without crashing", () => {
		const left = Array.from({ length: 6 }, (_, i) => `left-row-${i}`);
		const right = Array.from({ length: 6 }, (_, i) => `right-row-${i}`);
		const rows = zipColumns(left, right, 48, 120, " │ ");
		expect(rows).toHaveLength(6);
		rows.forEach((r) => expect(typeof r).toBe("string"));
	});

	it("compact mode (single column width = 58) does not crash", () => {
		// simulate compact mode where caller doesn't zip but each line is just truncated
		const rows = zipColumns(["session profile", "status"], [], 30, 60, " | ");
		expect(rows).toHaveLength(2);
	});

	it("separator is included in each row", () => {
		const rows = zipColumns(["L"], ["R"], 10, 25, " | ");
		expect(rows[0]).toContain(" | ");
	});
});
