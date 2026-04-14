import { describe, expect, it } from "bun:test";
import { PALETTE_MAP } from "../../../shared/theme/index.js";
import { makeThemeState } from "../src/state.js";
import { renderThemeWidgetLines, themeStatusText } from "../src/ui.js";

describe("theme UI helpers", () => {
	it("renders the active theme in the widget", () => {
		const state = makeThemeState("dracula");
		const lines = renderThemeWidgetLines(state, process.cwd(), {
			frame: 1,
			startedAt: Date.now() - 100,
		});

		expect(lines.join("\n")).toContain("dracula");
		expect(lines.join("\n")).toContain("/theme set <name>");
	});

	it("recovers from legacy non-palette active values without throwing", () => {
		const state = makeThemeState("dracula");
		state.setActive("dark");

		expect(() =>
			renderThemeWidgetLines(state, process.cwd(), {
				frame: 1,
				startedAt: Date.now() - 100,
			}),
		).not.toThrow();
		expect(state.getActive()).not.toBe("dark");
		expect(PALETTE_MAP.has(state.getActive())).toBe(true);
	});

	it("formats the footer status text", () => {
		expect(themeStatusText("nord")).toContain("nord");
		expect(themeStatusText("nord")).toContain("/theme cycle");
	});
});
