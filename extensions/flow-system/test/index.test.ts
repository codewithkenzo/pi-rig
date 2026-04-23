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

	it("clears stale in-memory queue on session_start when no persisted flow entry exists", async () => {
		const tools: Record<string, { name: string; execute: (...args: any[]) => Promise<any> }> = {};
		const handlers = new Map<string, (...args: any[]) => any>();

		const pi = {
			registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => {
				tools[tool.name] = tool;
			},
			registerCommand: () => undefined,
			registerShortcut: () => undefined,
			on: (event: string, handler: (...args: any[]) => any) => {
				handlers.set(event, handler);
			},
			appendEntry: () => undefined,
		} as unknown as ExtensionAPI;

		await flowSystem(pi);
		const sessionStart = handlers.get("session_start");
		const statusTool = tools["flow_status"];
		expect(sessionStart).toBeDefined();
		expect(statusTool).toBeDefined();
		if (sessionStart === undefined || statusTool === undefined) {
			throw new Error("expected session_start handler and flow_status tool");
		}

		await sessionStart(
			{},
			{
				hasUI: false,
				sessionManager: {
					getEntries: () => [
						{
							type: "custom",
							customType: "flow_system_state",
							data: {
								jobs: [
									{
										id: "job-1",
										profile: "explore",
										task: "scan repo",
										status: "done",
										createdAt: 1,
										finishedAt: 2,
										output: "ok",
									},
								],
							},
						},
					],
				},
				ui: {},
			} as unknown as Parameters<NonNullable<typeof sessionStart>>[1],
		);

		let result = await statusTool.execute("status-1", {}, undefined, undefined, {});
		expect(result.content[0]?.text).toContain("Flow jobs (1)");

		await sessionStart(
			{},
			{
				hasUI: false,
				sessionManager: { getEntries: () => [] },
				ui: {},
			} as unknown as Parameters<NonNullable<typeof sessionStart>>[1],
		);

		result = await statusTool.execute("status-2", {}, undefined, undefined, {});
		expect(result.content[0]?.text).toContain("No flow jobs.");
	});
});
