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

		expect(registerToolCount).toBe(3);
		expect(registerCommandCount).toBe(1);
		expect(registerShortcutCount).toBe(1);
		expect(registerEventCount).toBe(4);
	});

	it("retries initialization on the same API instance after a failed first attempt without duplicating completed steps", async () => {
		let registerToolCount = 0;
		let registerCommandCount = 0;
		let registerEventCount = 0;

		const pi = {
			registerTool: () => {
				registerToolCount += 1;
				if (registerToolCount === 2) {
					throw new Error("temporary setup failure");
				}
			},
			registerCommand: () => {
				registerCommandCount += 1;
			},
			registerShortcut: () => {
				return undefined;
			},
			on: () => {
				registerEventCount += 1;
			},
			appendEntry: () => undefined,
		} as unknown as ExtensionAPI;

		await expect(flowSystem(pi)).rejects.toThrow("temporary setup failure");
		await flowSystem(pi);

		expect(registerToolCount).toBe(4);
		expect(registerCommandCount).toBe(1);
		expect(registerEventCount).toBe(4);
	});

	it("keeps command/shortcut idempotent when command registration helper fails mid-way", async () => {
		let registerToolCount = 0;
		let registerCommandCount = 0;
		let registerShortcutCount = 0;
		let registerEventCount = 0;

		const pi = {
			registerTool: () => {
				registerToolCount += 1;
				if (registerToolCount === 99) {
					throw new Error("tool registration failure");
				}
			},
			registerCommand: () => {
				registerCommandCount += 1;
			},
			registerShortcut: () => {
				registerShortcutCount += 1;
				if (registerShortcutCount === 1) {
					throw new Error("shortcut registration failure");
				}
			},
			on: () => {
				registerEventCount += 1;
			},
			appendEntry: () => undefined,
		} as unknown as ExtensionAPI;

		await expect(flowSystem(pi)).rejects.toThrow("shortcut registration failure");
		await flowSystem(pi);

		expect(registerToolCount).toBe(3);
		expect(registerCommandCount).toBe(1);
		expect(registerShortcutCount).toBe(2);
		expect(registerEventCount).toBe(4);
	});
});
