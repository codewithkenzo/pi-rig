import { describe, it, expect } from "bun:test";
import { sanitize } from "../src/deck/summary.js";
import { renderHeader } from "../src/deck/header.js";
import { renderSummary } from "../src/deck/summary.js";
import { renderColumns } from "../src/deck/columns.js";
import { renderFooter } from "../src/deck/footer.js";
import { computeDeckFrameLayout, padDeckFrame } from "../src/deck/frame.js";
import { visibleWidth } from "../src/deck/layout.js";
import type { ThemeEngine } from "../../../shared/theme/engine.js";
import type { Palette, ThemeConfig } from "../../../shared/theme/types.js";
import type { AnimationState } from "../../../shared/theme/animation.js";
import type { FlowJob, FlowQueue } from "../src/types.js";
import type { FlowActivityRow } from "../src/deck/journal.js";

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

const emptyActivity = (): FlowActivityRow[] => [];

const makeActivityRows = (count: number, prefix: string): FlowActivityRow[] =>
	Array.from({ length: count }, (_, index) => ({
		kind: "assistant" as const,
		text: `${prefix}-${index + 1}`,
		ts: index + 1,
	}));

const renderDeck = ({
	job,
	activityRows,
	width,
	termRows,
	summaryScroll = 0,
	compactOverride,
}: {
	job: FlowJob | undefined;
	activityRows: readonly FlowActivityRow[];
	width: number;
	termRows: number;
	summaryScroll?: number;
	compactOverride?: boolean;
}): string[] => {
	const engine = mockEngine();
	const palette = mockPalette();
	const config = mockConfig();
	const compact = compactOverride ?? width < 96;
	const layout = computeDeckFrameLayout(termRows, compact);
	const keyFlash = { active_key: null, flash_timeout: null };
	return padDeckFrame(
		[
			...renderHeader(engine, palette, config, makeQueue(job === undefined ? [] : [job]), "/home/kenzo/dev/pi-plugins-repo-kenzo-worktrees/flow-deck-v2", mockAnimState(), width, compact),
			...renderColumns(engine, palette, config, job, activityRows, mockAnimState(), width, compact, layout.columnsHeight),
			...renderSummary(engine, palette, config, job, summaryScroll, width, layout.summaryHeight, mockAnimState()),
			...renderFooter(engine, keyFlash, makeQueue(job === undefined ? [] : [job]), width, compact, width < 60),
		],
		layout.frameHeight,
		width,
	);
};

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
		const lines = renderHeader(engine, palette, config, q, "/home/kenzo/dev/pi-plugins-repo-kenzo-worktrees/flow-deck-v2", mockAnimState(), 80, false);
		expect(Array.isArray(lines)).toBe(true);
		expect(lines.length).toBeGreaterThanOrEqual(3);
	});

	it("produces no ANSI truecolor codes in static mode", () => {
		const engine = mockEngine(); // mode: "none" → no ANSI
		const palette = mockPalette();
		const config = mockConfig(true);
		const q = makeQueue([makeJob()]);
		const lines = renderHeader(engine, palette, config, q, "/home/kenzo/dev/pi-plugins-repo-kenzo-worktrees/flow-deck-v2", mockAnimState(), 80, false);
		const all = lines.join("");
		expect(all).not.toMatch(/\x1b\[38;2/);
	});

	it("renders IDLE status when queue is empty", () => {
		const engine = mockEngine();
		const palette = mockPalette();
		const config = mockConfig(true);
		const q = makeQueue([]);
		const lines = renderHeader(engine, palette, config, q, "/home/kenzo/dev/pi-plugins-repo-kenzo-worktrees/flow-deck-v2", mockAnimState(), 80, false);
		expect(lines.join("")).toContain("IDLE");
	});

	it("shows queue counts and workspace basename", () => {
		const engine = mockEngine();
		const palette = mockPalette();
		const config = mockConfig(true);
		const q = makeQueue([
			makeJob({ status: "running" }),
			makeJob({ status: "pending", id: "pending-1" }),
		]);
		const lines = renderHeader(engine, palette, config, q, "/home/kenzo/dev/pi-plugins-repo-kenzo-worktrees/flow-deck-v2", mockAnimState(), 120, false);
		const all = lines.join("\n");
		expect(all).toContain("flow-deck-v2");
		expect(all).toContain("jobs 2");
		expect(all).toContain("run 1");
		expect(all).toContain("pend 1");
	});
});

describe("renderFooter", () => {
	it("appends queue health sentence", () => {
		const engine = mockEngine();
		const keyFlash = { active_key: null, flash_timeout: null };
		const queue = makeQueue([
			makeJob({ status: "running" }),
			makeJob({ status: "pending", id: "pending-1" }),
		]);
		const lines = renderFooter(engine, keyFlash, queue, 120, false, false);
		expect(lines.join("\n")).toContain("queue 2");
		expect(lines.join("\n")).toContain("running");
		expect(lines.join("\n")).toContain("pending");
		expect(lines).toHaveLength(3);
	});

	it("keeps width exact in compact mode", () => {
		const engine = mockEngine();
		const keyFlash = { active_key: null, flash_timeout: null };
		const queue = makeQueue([makeJob({ status: "done" })]);
		const lines = renderFooter(engine, keyFlash, queue, 80, true, false);
		expect(lines).toHaveLength(3);
		const line = lines[1];
		if (line === undefined) {
			throw new Error("missing footer line");
		}
		expect(line.length).toBe(80);
	});
});

// ─── renderSummary — states ──────────────────────────────────────────────────

describe("renderSummary", () => {
	it("renders 'No flow jobs yet.' when job is undefined", () => {
		const engine = mockEngine();
		const palette = mockPalette();
		const config = mockConfig();
		const lines = renderSummary(engine, palette, config, undefined, 0, 80, 10, mockAnimState());
		expect(lines.join("")).toContain("No flow jobs yet.");
		expect(lines).toHaveLength(10);
	});

	it("renders job output when present", () => {
		const engine = mockEngine();
		const palette = mockPalette();
		const config = mockConfig();
		const j = makeJob({ output: "great success" });
		const lines = renderSummary(engine, palette, config, j, 0, 80, 10, mockAnimState());
		expect(lines.join("")).toContain("great success");
		expect(lines).toHaveLength(10);
	});

	it("renders job error for failed jobs", () => {
		const engine = mockEngine();
		const palette = mockPalette();
		const config = mockConfig();
		const j = makeJob({ status: "failed", error: "something broke" });
		const lines = renderSummary(engine, palette, config, j, 0, 80, 10, mockAnimState());
		expect(lines.join("")).toContain("something broke");
		expect(lines).toHaveLength(10);
	});

	it("sanitizes ANSI from subprocess output", () => {
		const engine = mockEngine();
		const palette = mockPalette();
		const config = mockConfig();
		const j = makeJob({ output: "\x1b[31mred text\x1b[0m" });
		const lines = renderSummary(engine, palette, config, j, 0, 80, 10, mockAnimState());
		expect(lines.join("")).toContain("red text");
		expect(lines.join("")).not.toContain("\x1b[31m");
		expect(lines).toHaveLength(10);
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
			renderSummary(engine, palette, config, minimalJob, 0, 80, 10, mockAnimState());
		}).not.toThrow();
	});

	it("falls back to task text when no output/error/assistant", () => {
		const engine = mockEngine();
		const palette = mockPalette();
		const config = mockConfig();
		const j = makeJob({ status: "running", task: "explore the codebase" });
		const lines = renderSummary(engine, palette, config, j, 0, 80, 10, mockAnimState());
		expect(lines.join("")).toContain("explore the codebase");
		expect(lines).toHaveLength(10);
	});
});

// ─── renderColumns — compact mode ────────────────────────────────────────────

describe("renderColumns — compact mode (width < 96)", () => {
	it("returns string array without crashing", () => {
		const engine = mockEngine();
		const palette = mockPalette();
		const config = mockConfig();
		const j = makeJob();
		const activity = emptyActivity();
		const lines = renderColumns(engine, palette, config, j, activity, mockAnimState(), 80, true, 12);
		expect(Array.isArray(lines)).toBe(true);
		expect(lines.length).toBe(12);
	});

	it("does not use zipColumns separator │ in compact mode", () => {
		const engine = mockEngine();
		const palette = mockPalette();
		const config = mockConfig();
		const j = makeJob();
		const activity = emptyActivity();
		const lines = renderColumns(engine, palette, config, j, activity, mockAnimState(), 80, true, 12);
		// In compact mode, no column separator
		expect(lines.join("")).not.toContain("│");
	});

	it("wide mode (width >= 96) keeps vertical hierarchy without column separator", () => {
		const engine = mockEngine();
		const palette = mockPalette();
		const config = mockConfig();
		const j = makeJob();
		const activity: FlowActivityRow[] = [{ kind: "progress", text: "activity", ts: 2000 }];
		const lines = renderColumns(engine, palette, config, j, activity, mockAnimState(), 100, false, 14);
		const all = lines.join("\n");
		expect(all).not.toContain("│");
		expect(all).toContain("WORK ITEM");
		expect(all).toContain("AGENT");
		expect(all).toContain("LIVE ACTIVITY");
		expect(lines).toHaveLength(14);
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
			renderColumns(engine, palette, config, j, emptyActivity(), mockAnimState(), 80, true, 12);
		}).not.toThrow();
	});

	it("shows model, reasoning, and effort rows from envelope data", () => {
		const engine = mockEngine();
		const palette = mockPalette();
		const config = mockConfig();
		const j = makeJob({
			envelope: {
				reasoning: "high",
				maxIterations: 84,
				model: "gpt-5.4",
				provider: "openai",
				effort: "minimal",
			},
		});

		const lines = renderColumns(engine, palette, config, j, emptyActivity(), mockAnimState(), 80, true, 12);
		const all = lines.join("\n");
		expect(all).toContain("Model");
		expect(all).toContain("gpt-5.4@openai");
		expect(all).toContain("Reasoning");
		expect(all).toContain("high");
		expect(all).toContain("Effort");
		expect(all).toContain("minimal");
		expect(lines).toHaveLength(12);
	});

	it("shows default fallback values when envelope data is missing", () => {
		const engine = mockEngine();
		const palette = mockPalette();
		const config = mockConfig();
		const j: FlowJob = {
			id: "old-job",
			profile: "explore",
			task: "map the repo",
			status: "done",
			createdAt: 1000,
		};

		const lines = renderColumns(engine, palette, config, j, emptyActivity(), mockAnimState(), 80, true, 12);
		const all = lines.join("\n");
		expect(all).toContain("Model");
		expect(all).toContain("(default)");
		expect(all).toContain("Reasoning");
		expect(all).toContain("(profile default)");
		expect(all).toContain("Effort");
		expect(all).toContain("auto");
		expect(lines).toHaveLength(12);
	});
});

// ─── regression — full frame width/height safety ─────────────────────────────

describe("deck frame regression", () => {
	it("keeps every rendered line at requested visible width across states", () => {
		const states = [
			{
				name: "busy",
				job: makeJob({
					status: "running",
					lastProgress: "editing selectors",
					lastAssistantText: "working",
					recentTools: ["tool-a", "tool-b"],
				}),
				activityRows: makeActivityRows(12, "busy"),
			},
			{
				name: "quiet",
				job: makeJob({
					status: "done",
					output: "finished",
				}),
				activityRows: emptyActivity(),
			},
			{
				name: "short",
				job: makeJob({
					status: "pending",
					task: "short",
				}),
				activityRows: makeActivityRows(1, "short"),
			},
			{
				name: "long",
				job: makeJob({
					status: "failed",
					error: "x".repeat(240),
				}),
				activityRows: makeActivityRows(24, "long"),
			},
		] as const;

		for (const width of [80, 120]) {
			for (const state of states) {
				const frame = renderDeck({
					job: state.job,
					activityRows: state.activityRows,
					width,
					termRows: 40,
				});
				expect(frame.length).toBe(computeDeckFrameLayout(40, width < 96).frameHeight);
				for (const line of frame) {
					expect(visibleWidth(line)).toBe(width);
				}
			}
		}
	});

	it("keeps section row counts stable across busy/quiet/short/long states", () => {
		const states = [
			{
				job: makeJob({
					status: "running",
					lastProgress: "editing selectors",
					lastAssistantText: "working",
					recentTools: ["tool-a", "tool-b"],
				}),
				activityRows: makeActivityRows(12, "busy"),
			},
			{
				job: makeJob({ status: "done", output: "finished" }),
				activityRows: emptyActivity(),
			},
			{
				job: makeJob({ status: "pending", task: "short" }),
				activityRows: makeActivityRows(1, "short"),
			},
			{
				job: makeJob({ status: "failed", error: "x".repeat(240) }),
				activityRows: makeActivityRows(24, "long"),
			},
		];

		for (const width of [80, 120]) {
			const compact = width < 96;
			const layout = computeDeckFrameLayout(40, compact);
			for (const state of states) {
				const engine = mockEngine();
				const palette = mockPalette();
				const config = mockConfig();
				const columns = renderColumns(engine, palette, config, state.job, state.activityRows, mockAnimState(), width, compact, layout.columnsHeight);
				const summary = renderSummary(engine, palette, config, state.job, 0, width, layout.summaryHeight, mockAnimState());
				const frame = renderDeck({
					job: state.job,
					activityRows: state.activityRows,
					width,
					termRows: 40,
				});

				expect(columns).toHaveLength(layout.columnsHeight);
				expect(summary).toHaveLength(layout.summaryHeight);
				expect(frame).toHaveLength(layout.frameHeight);
			}
		}
	});
});
