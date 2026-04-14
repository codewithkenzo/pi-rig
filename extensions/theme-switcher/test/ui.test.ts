import { describe, expect, it } from "bun:test";
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

	it("formats the footer status text", () => {
		expect(themeStatusText("nord")).toContain("nord");
		expect(themeStatusText("nord")).toContain("/theme cycle");
	});
});
