import { describe, it, expect } from "bun:test";
import { sanitize } from "../src/deck/summary.js";
import { renderHeader } from "../src/deck/header.js";
import { renderSummary } from "../src/deck/summary.js";
import { renderColumns } from "../src/deck/columns.js";
import type { ThemeEngine } from "../../../shared/theme/engine.js";
import type { Palette, ThemeConfig } from "../../../shared/theme/types.js";
import type { AnimationState } from "../../../shared/theme/animation.js";
import type { FlowJob, FlowQueue } from "../src/types.js";
import type { FeedState } from "../src/deck/state.js";

// ─── Test helpers ─────────────────────────────────────────────────────────────

const mockPalette = (): Palette => ({
	name: "test",
	variant: "dark",
	semantic: {
		accent: "#cba6f7",
		success: "#a6e3a1",
		error:   "#f38ba8",
		warning: "#fab387",
		muted:   "#6c7086",
		dim:     "#45475a",
		text:    "#cdd6f4",
		border:  "#313244",
		highlight: "#89b4fa",
		info:    "#89dceb",
		active:  "#a6e3a1",
		inactive:"#6c7086",
		header:  "#cdd6f4",
		label:   "#cdd6f4",
		value:   "#89b4fa",
		separator:"#313244",
	},
	raw: {},
});

const mockEngine = (): ThemeEngine => {
	const palette = mockPalette();
	return {
		fg: (_t, text) => text,
		bg: (_t, text) => text,
		bold:      (text) => text,
		dim:       (text) => text,
		italic:    (text) => text,
		underline: (text) => text,
		gradient:  (text) => text,
		raw:       (_hex, text) => text,
		rawBg:     (_hex, text) => text,
		strip:     (text) => text,
		palette,
		mode: "none",
	};
};

// reducedMotion: true so withMotion always returns static fallback
const mockConfig = (reducedMotion = true): ThemeConfig => ({
	schemaVersion: 1,
	active: "test",
	colorMode: "none",
	nerdFonts: false,
	animation: { enabled: true, fps: 8, reducedMotion },
});

const mockAnimState = (): AnimationState => ({ frame: 0, startedAt: 1000 });

const makeJob = (overrides: Partial<FlowJob> = {}): FlowJob => ({
	id: "test-id",
	profile: "research",
	task: "investigate something",
	status: "running",
	createdAt: 1000,
	...overrides,
});

const makeQueue = (jobs: FlowJob[]): FlowQueue => ({ jobs, mode: "sequential" });

const emptyFeed = (): FeedState => ({
	lines: [],
	last_progress: undefined,
	last_assistant: undefined,
});

// ─── sanitize() ───────────────────────────────────────────────────────────────

describe("sanitize", () => {
	it("strips ANSI escape sequences", () => {
		expect(sanitize("\x1b[32mhello\x1b[0m")).toBe("hello");
	});

	it("strips control characters (except \\n and \\t)", () => {
		expect(sanitize("hello\x07world")).toBe("helloworld");
		expect(sanitize("abc\x00def")).toBe("abcdef");
	});

	it("preserves newlines", () => {
		expect(sanitize("line1\nline2")).toBe("line1\nline2");
	});

	it("handles empty string", () => {
		expect(sanitize("")).toBe("");
	});

	it("passes through plain text unchanged", () => {
		expect(sanitize("plain text 123")).toBe("plain text 123");
	});
});

// ─── renderHeader — reducedMotion ────────────────────────────────────────────

describe("renderHeader — reducedMotion: true", () => {
	it("returns string array", () => {
		const engine = mockEngine();
		const palette = mockPalette();
		const config = mockConfig(true);
		const q = makeQueue([makeJob()]);
		const lines = renderHeader(engine, palette, config, q, mockAnimState(), 80, false);
		expect(Array.isArray(lines)).toBe(true);
		expect(lines.length).toBeGreaterThanOrEqual(3);
	});

	it("produces no ANSI truecolor codes in static mode", () => {
		const engine = mockEngine(); // mode: "none" → no ANSI
		const palette = mockPalette();
		const config = mockConfig(true);
		const q = makeQueue([makeJob()]);
		const lines = renderHeader(engine, palette, config, q, mockAnimState(), 80, false);
		const all = lines.join("");
		expect(all).not.toMatch(/\x1b\[38;2/);
	});

	it("renders IDLE status when queue is empty", () => {
		const engine = mockEngine();
		const palette = mockPalette();
		const config = mockConfig(true);
		const q = makeQueue([]);
		const lines = renderHeader(engine, palette, config, q, mockAnimState(), 80, false);
		expect(lines.join("")).toContain("IDLE");
	});
});

// ─── renderSummary — states ──────────────────────────────────────────────────

describe("renderSummary", () => {
	it("renders 'No flow jobs yet.' when job is undefined", () => {
		const engine = mockEngine();
		const palette = mockPalette();
		const config = mockConfig();
		const lines = renderSummary(engine, palette, config, undefined, 0, 80, 8, mockAnimState());
		expect(lines.join("")).toContain("No flow jobs yet.");
	});

	it("renders job output when present", () => {
		const engine = mockEngine();
		const palette = mockPalette();
		const config = mockConfig();
		const j = makeJob({ output: "great success" });
		const lines = renderSummary(engine, palette, config, j, 0, 80, 8, mockAnimState());
		expect(lines.join("")).toContain("great success");
	});

	it("renders job error for failed jobs", () => {
		const engine = mockEngine();
		const palette = mockPalette();
		const config = mockConfig();
		const j = makeJob({ status: "failed", error: "something broke" });
		const lines = renderSummary(engine, palette, config, j, 0, 80, 8, mockAnimState());
		expect(lines.join("")).toContain("something broke");
	});

	it("sanitizes ANSI from subprocess output", () => {
		const engine = mockEngine();
		const palette = mockPalette();
		const config = mockConfig();
		const j = makeJob({ output: "\x1b[31mred text\x1b[0m" });
		const lines = renderSummary(engine, palette, config, j, 0, 80, 8, mockAnimState());
		expect(lines.join("")).toContain("red text");
		expect(lines.join("")).not.toContain("\x1b[31m");
	});

	it("renders old-format FlowJob (no optional fields) without crash", () => {
		// Simulates a persisted FlowJob that lacks toolCount, startedAt, output, etc.
		const engine = mockEngine();
		const palette = mockPalette();
		const config = mockConfig();
		const minimalJob: FlowJob = {
			id: "old-job",
			profile: "explore",
			task: "map the repo",
			status: "done",
			createdAt: 1000,
		};
		expect(() => {
			renderSummary(engine, palette, config, minimalJob, 0, 80, 8, mockAnimState());
		}).not.toThrow();
	});

	it("falls back to task text when no output/error/assistant", () => {
		const engine = mockEngine();
		const palette = mockPalette();
		const config = mockConfig();
		const j = makeJob({ status: "running", task: "explore the codebase" });
		const lines = renderSummary(engine, palette, config, j, 0, 80, 8, mockAnimState());
		expect(lines.join("")).toContain("explore the codebase");
	});
});

// ─── renderColumns — compact mode ────────────────────────────────────────────

describe("renderColumns — compact mode (width < 96)", () => {
	it("returns string array without crashing", () => {
		const engine = mockEngine();
		const palette = mockPalette();
		const config = mockConfig();
		const j = makeJob();
		const feed = emptyFeed();
		const lines = renderColumns(engine, palette, config, j, feed, mockAnimState(), 80, true);
		expect(Array.isArray(lines)).toBe(true);
		expect(lines.length).toBeGreaterThan(0);
	});

	it("does not use zipColumns separator │ in compact mode", () => {
		const engine = mockEngine();
		const palette = mockPalette();
		const config = mockConfig();
		const j = makeJob();
		const feed = emptyFeed();
		const lines = renderColumns(engine, palette, config, j, feed, mockAnimState(), 80, true);
		// In compact mode, no column separator
		expect(lines.join("")).not.toContain("│");
	});

	it("wide mode (width >= 96) includes column separator", () => {
		const engine = mockEngine();
		const palette = mockPalette();
		const config = mockConfig();
		const j = makeJob();
		const feed: FeedState = { lines: [{ text: "activity", ts: 2000 }], last_progress: undefined, last_assistant: undefined };
		const lines = renderColumns(engine, palette, config, j, feed, mockAnimState(), 100, false);
		expect(lines.join("")).toContain("│");
	});

	it("renders stale restored job without crash", () => {
		const engine = mockEngine();
		const palette = mockPalette();
		const config = mockConfig();
		const j: FlowJob = {
			id: "stale",
			profile: "explore",
			task: "was running before restart",
			status: "failed",
			createdAt: 1000,
			error: "Restored active job has no live process; stale restore: previous process not live",
		};
		expect(() => {
			renderColumns(engine, palette, config, j, emptyFeed(), mockAnimState(), 80, true);
		}).not.toThrow();
	});
});
