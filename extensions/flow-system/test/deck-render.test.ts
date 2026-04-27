import { describe, it, expect } from "bun:test";
import { sanitize } from "../src/deck/summary.js";
import { renderHeader } from "../src/deck/header.js";
import { renderSummary } from "../src/deck/summary.js";
import { renderColumns } from "../src/deck/columns.js";
import { renderFooter } from "../src/deck/footer.js";
import { computeDeckFrameLayout, padDeckFrame } from "../src/deck/frame.js";
import { visibleWidth } from "../src/deck/layout.js";
import { selectQueueRailRows } from "../src/deck/selectors.js";
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
	queue,
	selectedId,
	activityRows,
	width,
	termRows,
	summaryScroll = 0,
	compactOverride,
}: {
	job: FlowJob | undefined;
	queue?: FlowQueue;
	selectedId?: string | undefined;
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
	const snapshot = queue ?? makeQueue(job === undefined ? [] : [job]);
	const railRows = selectQueueRailRows(snapshot, selectedId ?? job?.id);
	return padDeckFrame(
		[
			...renderHeader(engine, palette, config, snapshot, "/home/kenzo/dev/pi-plugins-repo-kenzo-worktrees/flow-deck-v2", mockAnimState(), width, compact),
			...renderColumns(engine, palette, config, railRows, job, activityRows, mockAnimState(), width, compact, layout.columnsHeight),
			...renderSummary(engine, palette, config, job, summaryScroll, width, layout.summaryHeight, mockAnimState()),
			...renderFooter(engine, keyFlash, snapshot, width, compact, width < 60),
		],
		layout.frameHeight,
		width,
	);
};

const expectExactFrame = (frame: readonly string[], width: number, termRows: number): void => {
	expect(frame.length).toBe(computeDeckFrameLayout(termRows, width < 96).frameHeight);
	for (const line of frame) {
		expect(line).not.toContain("\n");
		expect(line).not.toContain("\t");
		expect(visibleWidth(line)).toBe(width);
	}
};

const makeQueueJobs = (count: number): FlowJob[] =>
	Array.from({ length: count }, (_, index) =>
		makeJob({
			id: `queue-job-${index + 1}`,
			profile: index % 2 === 0 ? `agent-${index + 1}` : `builder🚀-${index + 1}`,
			task: `queue task ${index + 1} with long rendering-safe label 👨‍💻 ⚙️`,
			status: index % 4 === 0 ? "running" : index % 4 === 1 ? "pending" : index % 4 === 2 ? "done" : "failed",
			createdAt: 1_000 + index * 1_000,
			startedAt: 2_000 + index * 1_000,
			lastProgress: `progress ${index + 1} 🚀`,
			lastAssistantText: `assistant ${index + 1} 👨‍💻`,
			...(index % 4 === 3 ? { error: `failed ${index + 1} ⚙️` } : {}),
		}),
	);

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
		const j = makeJob();
		const activity = emptyActivity();
		const railRows = selectQueueRailRows(makeQueue([j]), j.id, 1_000);
		const lines = renderColumns(mockEngine(), mockPalette(), mockConfig(), railRows, j, activity, mockAnimState(), 80, true, 12);
		expect(Array.isArray(lines)).toBe(true);
		expect(lines.length).toBe(12);
		for (const line of lines) {
			expect(visibleWidth(line)).toBe(80);
		}
	});

	it("does not use zipColumns separator │ in compact mode", () => {
		const j = makeJob();
		const activity = emptyActivity();
		const railRows = selectQueueRailRows(makeQueue([j]), j.id, 1_000);
		const lines = renderColumns(mockEngine(), mockPalette(), mockConfig(), railRows, j, activity, mockAnimState(), 80, true, 12);
		// In compact mode, no column separator
		expect(lines.join("")).not.toContain("│");
		expect(lines.join("\n")).toContain("FLOW JOBS / AGENTS");
		expect(lines.join("\n")).toContain("[01]");
	});

	it("wide mode (width >= 96) keeps vertical hierarchy without column separator", () => {
		const jobs = Array.from({ length: 12 }, (_, index) =>
			makeJob({
				id: `job-${index + 1}`,
				profile: `agent-${index + 1}`,
				task: `task-${index + 1}`,
				status: index % 3 === 0 ? "running" : index % 3 === 1 ? "pending" : "done",
				createdAt: 1_000 + index * 1_000,
				...(index === 6
					? {
						writingSummary: true,
						summaryPhaseSource: "explicit" as const,
						envelope: {
							reasoning: "high",
							maxIterations: 40,
							maxToolCalls: 10,
						},
						toolCount: 6,
					}
					: {}),
			}),
		);
		const queue = makeQueue(jobs);
		const railRows = selectQueueRailRows(queue, "job-7", 20_000);
		const activity: FlowActivityRow[] = [{ kind: "progress", text: "activity", ts: 2000 }];
		const lines = renderColumns(mockEngine(), mockPalette(), mockConfig(), railRows, jobs[6], activity, mockAnimState(), 120, false, 14);
		const all = lines.join("\n");
		expect(all).not.toContain("│");
		expect(all).toContain("FLOW JOBS / AGENTS");
		expect(all).toContain("[12]");
		expect(all).toContain("▎");
		expect(all).toContain("agent-7");
		expect(all).toContain("LIVE ACTIVITY");
		expect(lines).toHaveLength(14);
	});

	it("renders stale restored job without crash", () => {
		const j: FlowJob = {
			id: "stale",
			profile: "explore",
			task: "was running before restart",
			status: "failed",
			createdAt: 1000,
			error: "Restored active job has no live process; stale restore: previous process not live",
		};
		const railRows = selectQueueRailRows(makeQueue([j]), j.id, 1_000);
		expect(() => {
			renderColumns(mockEngine(), mockPalette(), mockConfig(), railRows, j, emptyActivity(), mockAnimState(), 80, true, 12);
		}).not.toThrow();
	});

	it("handles optional fields absent without overflowing", () => {
		const j: FlowJob = {
			id: "old-job",
			profile: "explore",
			task: "map the repo",
			status: "done",
			createdAt: 1000,
		};
		const railRows = selectQueueRailRows(makeQueue([j]), undefined, 10_000);
		const lines = renderColumns(mockEngine(), mockPalette(), mockConfig(), railRows, j, emptyActivity(), mockAnimState(), 80, true, 12);
		const all = lines.join("\n");
		expect(all).toContain("map the repo");
		expect(all).not.toContain("undefined");
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

		for (const width of [62, 80, 120]) {
			for (const state of states) {
				const frame = renderDeck({
					job: state.job,
					activityRows: state.activityRows,
					width,
					termRows: 40,
				});
				expectExactFrame(frame, width, 40);
			}
		}
	});

	it("keeps exact width and stable frame height across queue sizes", () => {
		for (const width of [62, 80, 120]) {
			const lengths: number[] = [];
			for (const size of [0, 1, 12, 30]) {
				const jobs = makeQueueJobs(size);
				const selectedIndex = jobs.length >= 30 ? jobs.length - 1 : Math.min(6, Math.max(0, jobs.length - 1));
				const selected = jobs[selectedIndex];
				const frame = renderDeck({
					job: selected,
					queue: makeQueue(jobs),
					selectedId: selected?.id,
					activityRows: makeActivityRows(size === 0 ? 0 : 18, `queue-${size}`),
					width,
					termRows: 40,
				});
				expectExactFrame(frame, width, 40);
				lengths.push(frame.length);
			}
			expect(new Set(lengths).size).toBe(1);
		}
	});

	it("keeps progress/tool rows with wide emoji inside frame width", () => {
		const job = makeJob({
			id: "emoji-job",
			profile: "builder🚀",
			task: "ship emoji-safe progress 👨‍💻 ⚙️ 🇮🇹",
			status: "running",
			lastProgress: "editing layout 🚀\nnext line must not split row",
			recentTools: ["grep🚀", "read👨‍💻", "edit⚙️"],
		});
		const activityRows: FlowActivityRow[] = [
			{ kind: "tool_start", label: "grep🚀", text: "scan emoji rows 👨‍💻\twide", ts: 2_000, tone: "active" },
			{ kind: "tool_end", label: "edit⚙️", text: "patched 🇮🇹 without overflow", ts: 3_000, tone: "success" },
			{ kind: "assistant", text: "summary line 🚀 👨‍💻 ⚙️ repeats ".repeat(6), ts: 4_000 },
		];

		for (const width of [62, 80, 120]) {
			const frame = renderDeck({ job, activityRows, width, termRows: 40 });
			expectExactFrame(frame, width, 40);
		}
	});

	it("keeps compact boundary widths stable across stream updates and long running summary", () => {
		const job = makeJob({
			id: "boundary-job",
			profile: "research",
			task: "boundary render safety",
			status: "running",
			lastAssistantText: "running summary 🚀 ".repeat(80),
			lastProgress: "streaming 👨‍💻",
		});
		for (const width of [60, 61, 62, 95, 96]) {
			const lengths: number[] = [];
			for (const count of [0, 1, 12, 30]) {
				const frame = renderDeck({
					job,
					activityRows: makeActivityRows(count, `boundary-${count}-🚀`),
					width,
					termRows: 40,
				});
				expectExactFrame(frame, width, 40);
				lengths.push(frame.length);
			}
			expect(new Set(lengths).size).toBe(1);
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

		for (const width of [62, 80, 120]) {
			const compact = width < 96;
			const layout = computeDeckFrameLayout(40, compact);
			for (const state of states) {
				const engine = mockEngine();
				const palette = mockPalette();
				const config = mockConfig();
				const railRows = selectQueueRailRows(makeQueue([state.job]), state.job.id, 1_000);
				const columns = renderColumns(engine, palette, config, railRows, state.job, state.activityRows, mockAnimState(), width, compact, layout.columnsHeight);
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
