import { describe, expect, it } from "bun:test";
import { makeThemeState } from "../src/state.js";
import { handleThemeCommand } from "../src/commands.js";

const makeCtx = (themeName = "catppuccin-mocha") => {
	const messages: string[] = [];
	const selections: Array<string | undefined> = [];
	return {
		messages,
		selections,
		ctx: {
			cwd: process.cwd(),
			ui: {
				theme: { name: themeName },
				notify: (message: string) => {
					messages.push(message);
				},
				select: async () => selections.shift(),
				setWidget: () => undefined,
				setStatus: () => undefined,
				setTheme: () => ({ success: true }),
			},
		},
	};
};

describe("/theme command", () => {
	it("shows status by default", async () => {
		const state = makeThemeState("dracula");
		const { ctx, messages } = makeCtx("dracula");

		await handleThemeCommand("", ctx as never, state);

		expect(messages.join("\n")).toContain("Active: dracula");
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
		const { ctx, messages, selections } = makeCtx("dracula");
		selections.push("nord");

		await handleThemeCommand("pick", ctx as never, state);

		expect(state.getActive()).toBe("nord");
		expect(messages.at(-1)).toContain("nord");
	});
});
