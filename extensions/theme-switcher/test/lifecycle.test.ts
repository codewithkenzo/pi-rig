import { describe, expect, it } from "bun:test";
import type { ExtensionAPI, ExtensionContext, SessionStartEvent, Theme } from "@mariozechner/pi-coding-agent";
import { registerThemeLifecycle } from "../src/lifecycle.js";
import { makeThemeState } from "../src/state.js";
import { buildThemeContextNote, themeSkillDirExists } from "../src/runtime.js";
import { findSavedThemeEntry, restoreThemeEntry, snapshotThemeEntry } from "../src/session.js";
import { THEME_ENTRY_TYPE } from "../src/types.js";

class MockTheme {
	name: string | undefined;

	constructor(
		_fgColors?: Record<string, string | number>,
		_bgColors?: Record<string, string | number>,
		_mode?: string,
		options?: { name?: string },
	) {
		this.name = options?.name;
	}
}

describe("theme lifecycle helpers", () => {
	it("findSavedThemeEntry returns the latest theme entry", () => {
		const now = new Date().toISOString();
		const entry = findSavedThemeEntry([
			{
				id: "a",
				parentId: null,
				timestamp: now,
				type: "custom",
				customType: "other",
				data: { active: "nord" },
			},
			{
				id: "b",
				parentId: "a",
				timestamp: now,
				type: "custom",
				customType: THEME_ENTRY_TYPE,
				data: { active: "dracula" },
			},
			{
				id: "c",
				parentId: "b",
				timestamp: now,
				type: "custom",
				customType: THEME_ENTRY_TYPE,
				data: { active: "gruvbox-dark" },
			},
		]);

		expect(entry?.active).toBe("gruvbox-dark");
	});

	it("snapshotThemeEntry captures the active theme", () => {
		const state = makeThemeState("nord");
		expect(snapshotThemeEntry(state)).toEqual({ active: "nord" });
	});

	it("buildThemeContextNote includes the active theme", () => {
		expect(buildThemeContextNote("dracula")).toContain("dracula");
	});

	it("theme skill dir exists", () => {
		expect(themeSkillDirExists()).toBe(true);
	});

	it("restoreThemeEntry leaves state unchanged on missing entry", async () => {
		const state = makeThemeState("catppuccin-mocha");
		const restored = await restoreThemeEntry(
			{
				ui: {
					setTheme: () => ({ success: true }),
					theme: new MockTheme(undefined, undefined, undefined, { name: "catppuccin-mocha" }) as Theme,
				},
			},
			state,
			undefined,
		);

		expect(restored).toBe(false);
		expect(state.getActive()).toBe("catppuccin-mocha");
	});

	it("restoreThemeEntry normalizes legacy alias values before applying", async () => {
		const calls: string[] = [];
		const state = makeThemeState("dracula");
		const restored = await restoreThemeEntry(
			{
				ui: {
					setTheme: (theme) => {
						calls.push(typeof theme === "string" ? theme : (theme.name ?? "unnamed-theme"));
						return { success: true };
					},
					theme: new MockTheme(undefined, undefined, undefined, { name: "dark" }) as Theme,
				},
			},
			state,
			{ active: "dark" },
		);

		expect(restored).toBe(true);
		expect(calls).toEqual(["dracula"]);
		expect(state.getActive()).toBe("dracula");
	});

	it("restoreThemeEntry preserves saved non-palette theme names", async () => {
		const calls: string[] = [];
		const state = makeThemeState("catppuccin-mocha");
		const restored = await restoreThemeEntry(
			{
				ui: {
					setTheme: (theme) => {
						calls.push(typeof theme === "string" ? theme : (theme.name ?? "unnamed-theme"));
						return { success: true };
					},
					getTheme: (name: string) =>
						name === "my-installed-theme"
							? (new MockTheme(undefined, undefined, undefined, { name }) as Theme)
							: undefined,
					theme: new MockTheme(undefined, undefined, undefined, { name: "catppuccin-mocha" }) as Theme,
				},
			},
			state,
			{ active: "my-installed-theme" },
		);

		expect(restored).toBe(true);
		expect(calls).toContain("my-installed-theme");
		expect(state.getActive()).toBe("my-installed-theme");
	});

	it("restoreThemeEntry preserves a saved installed theme name when the UI accepts raw names", async () => {
		const calls: string[] = [];
		const state = makeThemeState("nord");
		const restored = await restoreThemeEntry(
			{
				ui: {
					setTheme: (theme) => {
						calls.push(typeof theme === "string" ? theme : (theme.name ?? "unnamed-theme"));
						return { success: true };
					},
					theme: new MockTheme(undefined, undefined, undefined, { name: "catppuccin-mocha" }) as Theme,
				},
			},
			state,
			{ active: "stale-installed-theme" },
		);

		expect(restored).toBe(true);
		expect(calls).toEqual(["stale-installed-theme"]);
		expect(state.getActive()).toBe("stale-installed-theme");
	});

	it("registerThemeLifecycle applies preferred theme on session_start when no saved entry exists", async () => {
		const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => Promise<unknown>>();
		const pi = {
			on: (event: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<unknown>) => {
				handlers.set(event, handler);
			},
			appendEntry: () => undefined,
		} as unknown as ExtensionAPI;

		const state = makeThemeState("dracula");
		registerThemeLifecycle(pi, state);

		const sessionStart = handlers.get("session_start");
		expect(sessionStart).toBeDefined();

		const setThemeCalls: string[] = [];
		await sessionStart?.(
			{} as SessionStartEvent,
			{
				cwd: process.cwd(),
				sessionManager: {
					getEntries: () => [],
				},
				ui: {
					setTheme: (theme: string | Theme) => {
						setThemeCalls.push(typeof theme === "string" ? theme : (theme.name ?? "unnamed-theme"));
						return { success: true };
					},
					theme: new MockTheme(undefined, undefined, undefined, { name: "catppuccin-mocha" }) as Theme,
				},
			} as unknown as ExtensionContext,
		);

		expect(setThemeCalls.length).toBeGreaterThan(0);
		expect(state.getActive()).toBe("dracula");
	});

	it("registerThemeLifecycle restores installed non-palette themes when getTheme is available", async () => {
		const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => Promise<unknown>>();
		const pi = {
			on: (event: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<unknown>) => {
				handlers.set(event, handler);
			},
			appendEntry: () => undefined,
		} as unknown as ExtensionAPI;

		const state = makeThemeState("my-installed-theme");
		registerThemeLifecycle(pi, state);
		const sessionStart = handlers.get("session_start");
		expect(sessionStart).toBeDefined();

		const setThemeCalls: string[] = [];
		await sessionStart?.(
			{} as SessionStartEvent,
			{
				cwd: process.cwd(),
				sessionManager: {
					getEntries: () => [],
				},
				ui: {
					setTheme: (theme: string | Theme) => {
						setThemeCalls.push(typeof theme === "string" ? theme : (theme.name ?? "unnamed-theme"));
						return { success: true };
					},
					getTheme: (name: string) =>
						name === "my-installed-theme"
							? (new MockTheme(undefined, undefined, undefined, { name }) as Theme)
							: undefined,
					theme: new MockTheme(undefined, undefined, undefined, { name: "catppuccin-mocha" }) as Theme,
				},
			} as unknown as ExtensionContext,
		);

		expect(setThemeCalls).toContain("my-installed-theme");
		expect(state.getActive()).toBe("my-installed-theme");
	});
});
