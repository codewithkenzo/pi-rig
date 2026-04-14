import { describe, expect, it } from "bun:test";
import { getPalette, loadTheme } from "../theme/index.js";

describe("@codewithkenzo/pi-shared smoke", () => {
	it("resolves a built-in palette", () => {
		const palette = getPalette("catppuccin-mocha");
		expect(palette.name).toBe("catppuccin-mocha");
	});

	it("loads theme config with sane fallback", () => {
		const result = loadTheme(process.cwd());
		expect(typeof result.config.active).toBe("string");
		expect(result.palette.name.length).toBeGreaterThan(0);
	});
});
