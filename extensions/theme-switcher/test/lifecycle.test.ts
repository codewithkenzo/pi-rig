import { describe, expect, it } from "bun:test";
import { makeThemeState } from "../src/state.js";
import { buildThemeContextNote, themeSkillDirExists } from "../src/runtime.js";
import { findSavedThemeEntry, restoreThemeEntry, snapshotThemeEntry } from "../src/session.js";
import { THEME_ENTRY_TYPE } from "../src/types.js";

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
					theme: { name: "catppuccin-mocha" },
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
					setTheme: (theme: string) => {
						calls.push(theme);
						return { success: true };
					},
					theme: { name: "dark" },
				},
			},
			state,
			{ active: "dark" },
		);

		expect(restored).toBe(true);
		expect(calls).toEqual(["dracula"]);
		expect(state.getActive()).toBe("dracula");
	});
});
