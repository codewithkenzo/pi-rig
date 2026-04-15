import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext, SessionStartEvent, Theme } from "@mariozechner/pi-coding-agent";
import themeSwitcher from "../index.js";
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

const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_CWD = process.cwd();

afterEach(() => {
	if (ORIGINAL_HOME === undefined) {
		delete process.env.HOME;
	} else {
		process.env.HOME = ORIGINAL_HOME;
	}
	process.chdir(ORIGINAL_CWD);
});

describe("theme-switcher index", () => {
	it("skips duplicate registration for the same API instance", async () => {
		let registerToolCount = 0;
		let registerCommandCount = 0;
		let registerEventCount = 0;
		const pi = {
			registerTool: () => {
				registerToolCount += 1;
			},
			registerCommand: () => {
				registerCommandCount += 1;
			},
			on: () => {
				registerEventCount += 1;
			},
			appendEntry: () => undefined,
		} as unknown as ExtensionAPI;

		await themeSwitcher(pi);
		await themeSwitcher(pi);

		expect(registerToolCount).toBe(3);
		expect(registerCommandCount).toBe(1);
		expect(registerEventCount).toBe(3);
	});

	it("keeps project theme precedence over saved global preference", async () => {
		const home = fs.mkdtempSync(path.join(os.tmpdir(), "theme-switcher-home-"));
		const project = fs.mkdtempSync(path.join(os.tmpdir(), "theme-switcher-project-"));
		const homeAgentDir = path.join(home, ".pi", "agent");
		const projectPiDir = path.join(project, ".pi");

		try {
			fs.mkdirSync(homeAgentDir, { recursive: true });
			fs.mkdirSync(projectPiDir, { recursive: true });

			fs.writeFileSync(
				path.join(homeAgentDir, "settings.json"),
				JSON.stringify({ theme: "dracula" }, null, 2),
				"utf8",
			);
			fs.writeFileSync(
				path.join(projectPiDir, "theme.json"),
				JSON.stringify({ active: "nord" }, null, 2),
				"utf8",
			);

			process.env.HOME = home;
			process.chdir(project);

			const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => Promise<unknown>>();
			const pi = {
				registerTool: () => undefined,
				registerCommand: () => undefined,
				on: (event: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<unknown>) => {
					handlers.set(event, handler);
				},
				appendEntry: () => undefined,
			} as unknown as ExtensionAPI;

			await themeSwitcher(pi);
			const sessionStart = handlers.get("session_start");
			const agentEnd = handlers.get("agent_end");
			expect(sessionStart).toBeDefined();
			expect(agentEnd).toBeDefined();

			const setThemeCalls: string[] = [];
			await sessionStart?.(
				{} as SessionStartEvent,
				{
					cwd: project,
					sessionManager: {
						getEntries: () => [
							{
								type: "custom",
								customType: THEME_ENTRY_TYPE,
								data: { active: "dracula" },
							},
						],
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

			expect(setThemeCalls).toContain("nord");
			expect(setThemeCalls).not.toContain("dracula");

			await agentEnd?.(
				{},
				{
					cwd: project,
					ui: {
						theme: new MockTheme(undefined, undefined, undefined, { name: "nord" }) as Theme,
					},
				} as unknown as ExtensionContext,
			);

			const settings = JSON.parse(
				fs.readFileSync(path.join(homeAgentDir, "settings.json"), "utf8"),
			) as { theme?: string };
			expect(settings.theme).toBe("dracula");
		} finally {
			fs.rmSync(home, { recursive: true, force: true });
			fs.rmSync(project, { recursive: true, force: true });
		}
	});

	it("restores project-scoped installed themes that are not in the shared palette map", async () => {
		const home = fs.mkdtempSync(path.join(os.tmpdir(), "theme-switcher-home-"));
		const project = fs.mkdtempSync(path.join(os.tmpdir(), "theme-switcher-project-"));
		const homeAgentDir = path.join(home, ".pi", "agent");
		const projectPiDir = path.join(project, ".pi");

		try {
			fs.mkdirSync(homeAgentDir, { recursive: true });
			fs.mkdirSync(projectPiDir, { recursive: true });

			fs.writeFileSync(
				path.join(homeAgentDir, "settings.json"),
				JSON.stringify({ theme: "dracula" }, null, 2),
				"utf8",
			);
			fs.writeFileSync(
				path.join(projectPiDir, "theme.json"),
				JSON.stringify({ active: "my-installed-theme" }, null, 2),
				"utf8",
			);

			process.env.HOME = home;
			process.chdir(project);

			const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => Promise<unknown>>();
			const pi = {
				registerTool: () => undefined,
				registerCommand: () => undefined,
				on: (event: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<unknown>) => {
					handlers.set(event, handler);
				},
				appendEntry: () => undefined,
			} as unknown as ExtensionAPI;

			await themeSwitcher(pi);
			const sessionStart = handlers.get("session_start");
			expect(sessionStart).toBeDefined();

			const setThemeCalls: string[] = [];
			await sessionStart?.(
				{} as SessionStartEvent,
				{
					cwd: project,
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
			expect(setThemeCalls).not.toContain("dracula");
		} finally {
			fs.rmSync(home, { recursive: true, force: true });
			fs.rmSync(project, { recursive: true, force: true });
		}
	});
});
