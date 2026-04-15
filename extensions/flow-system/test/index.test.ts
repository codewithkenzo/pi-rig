import { describe, expect, it } from "bun:test";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import flowSystem from "../index.js";

describe("flow-system index", () => {
	it("skips duplicate registration for the same API instance", async () => {
		let registerToolCount = 0;
		let registerCommandCount = 0;
		let registerEventCount = 0;
		let registerShortcutCount = 0;

		const pi = {
			registerTool: () => {
				registerToolCount += 1;
			},
			registerCommand: () => {
				registerCommandCount += 1;
			},
			registerShortcut: () => {
				registerShortcutCount += 1;
			},
			on: () => {
				registerEventCount += 1;
			},
			appendEntry: () => undefined,
		} as unknown as ExtensionAPI;

		await flowSystem(pi);
		await flowSystem(pi);

		expect(registerToolCount).toBe(2);
		expect(registerCommandCount).toBe(1);
		expect(registerShortcutCount).toBe(1);
		expect(registerEventCount).toBe(4);
	});
});
