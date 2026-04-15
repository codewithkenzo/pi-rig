import { describe, expect, it } from "bun:test";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { makeThemeState } from "../src/state.js";
import { handleThemeCommand } from "../src/commands.js";

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

const getThemeName = (value: string | Theme): string =>
	typeof value === "string" ? value : (value.name ?? "unnamed-theme");

const makeCtx = (themeName = "catppuccin-mocha") => {
	const messages: string[] = [];
	const selections: Array<string | undefined> = [];
	const setThemeCalls: string[] = [];
	const theme = new MockTheme(undefined, undefined, undefined, { name: themeName }) as Theme & { name: string | undefined };
	return {
		messages,
		selections,
		setThemeCalls,
		ctx: {
			cwd: process.cwd(),
			ui: {
				theme,
				notify: (message: string) => {
					messages.push(message);
				},
				select: async () => selections.shift(),
				setWidget: () => undefined,
				setStatus: () => undefined,
				setTheme: (nextTheme: string | Theme) => {
					const resolved = getThemeName(nextTheme);
					setThemeCalls.push(resolved);
					theme.name = resolved;
					return { success: true };
				},
			},
		},
	};
};

describe("/theme command", () => {
	it("opens the picker by default", async () => {
		const state = makeThemeState("dracula");
		const { ctx, messages, selections } = makeCtx("dracula");
		selections.push("nord");

		await handleThemeCommand("", ctx as never, state);

		expect(state.getActive()).toBe("nord");
		expect(messages.join("\n")).toContain("nord");
	});

	it("sets and cycles the active theme", async () => {
		const state = makeThemeState("catppuccin-mocha");
		const { ctx, messages } = makeCtx("catppuccin-mocha");

		await handleThemeCommand("set dracula", ctx as never, state);
		expect(messages.at(-1)).toContain("dracula");
		expect(state.getActive()).toBe("dracula");

		await handleThemeCommand("cycle", ctx as never, state);
		expect(state.getActive()).not.toBe("dracula");
	});

	it("lists and previews themes", async () => {
		const state = makeThemeState("dracula");
		const { ctx, messages } = makeCtx("dracula");

		await handleThemeCommand("list", ctx as never, state);
		expect(messages.at(-1)).toContain("dracula");

		await handleThemeCommand("preview nord", ctx as never, state);
		expect(messages.at(-1)).toContain("nord");
	});

	it("supports interactive theme picking", async () => {
		const state = makeThemeState("dracula");
		const { ctx, messages, selections, setThemeCalls } = makeCtx("dracula");
		selections.push("nord");

		await handleThemeCommand("pick", ctx as never, state);

		expect(setThemeCalls).toEqual(["nord"]);
		expect(state.getActive()).toBe("nord");
		expect(messages.at(-1)).toContain("nord");
	});
});
