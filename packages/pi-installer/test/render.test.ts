import { describe, expect, it } from "bun:test";
import { renderResults } from "../src/render.js";
import type { InstallerResult } from "../src/lib.js";

describe("renderResults", () => {
	it("renders plain-mode results with ready count", () => {
		const result: InstallerResult = {
			results: [
				{ name: "flow-system", ready: true, skillInstalled: true },
				{ name: "theme-switcher", ready: true, skillInstalled: false },
			],
			piPath: "/usr/bin/pi",
		};

		const lines = renderResults(result);
		const text = lines.join("\n");

		expect(text).toContain("2/2 ready");
		expect(text).toContain("flow-system: ready, skill installed");
		expect(text).toContain("theme-switcher: ready");
		expect(text).toContain("pi: /usr/bin/pi");
	});

	it("renders failed extensions", () => {
		const result: InstallerResult = {
			results: [
				{ name: "flow-system", ready: false, skillInstalled: false },
			],
			piPath: null,
		};

		const lines = renderResults(result);
		const text = lines.join("\n");

		expect(text).toContain("0/1 ready");
		expect(text).toContain("flow-system: failed");
		expect(text).not.toContain("pi:");
	});

	it("handles empty results", () => {
		const result: InstallerResult = {
			results: [],
			piPath: null,
		};

		const lines = renderResults(result);
		const text = lines.join("\n");

		expect(text).toContain("0/0 ready");
	});
});
