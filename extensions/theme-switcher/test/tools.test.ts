import { describe, expect, it } from "bun:test";
import type { AgentToolResult, Theme } from "@mariozechner/pi-coding-agent";
import { makeThemeState } from "../src/state.js";
import { makeThemeListTool, makeThemePreviewTool, makeThemeSetTool } from "../src/tools.js";

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

const makeCtx = (
	result: { success: boolean; error?: string },
	themeName = "catppuccin-mocha",
) => {
	const setThemeCalls: Array<string | Theme> = [];
	return {
		setThemeCalls,
		ctx: {
			ui: {
				setTheme: (theme: string | Theme) => {
					setThemeCalls.push(theme);
					return result;
				},
				theme: new MockTheme(undefined, undefined, undefined, { name: themeName }) as Theme,
			},
		},
	};
};

const getText = (result: AgentToolResult<unknown>): string | undefined => {
	const first = result.content[0];
	return first?.type === "text" ? first.text : undefined;
};

const getIsError = (result: AgentToolResult<unknown>): boolean | undefined => {
	const withErrorFlag = result as AgentToolResult<unknown> & { isError?: boolean };
	return withErrorFlag.isError;
};

describe("theme tools", () => {
	it("theme_set applies the requested theme", async () => {
		const state = makeThemeState("catppuccin-mocha");
		const tool = makeThemeSetTool(state);
		const { ctx, setThemeCalls } = makeCtx({ success: true });
		const result = await tool.execute(
			"tool-1",
			{ theme: "dracula" },
			undefined,
			undefined,
			ctx as never,
		);

		expect(getIsError(result)).toBeUndefined();
		expect(state.getActive()).toBe("dracula");
		expect((setThemeCalls[0] as Theme | undefined)?.name).toBe("dracula");
		expect(getText(result)).toContain("dracula");
	});

	it("theme_set returns an error when the UI rejects the theme", async () => {
		const state = makeThemeState("catppuccin-mocha");
		const tool = makeThemeSetTool(state);
		const { ctx } = makeCtx({ success: false, error: "missing" });
		const result = await tool.execute(
			"tool-2",
			{ theme: "dracula" },
			undefined,
			undefined,
			ctx as never,
		);

		expect(getIsError(result)).toBe(true);
		expect(state.getActive()).toBe("catppuccin-mocha");
		expect(getText(result)).toContain("missing");
	});

	it("theme_list renders the current active theme", async () => {
		const state = makeThemeState("dracula");
		const tool = makeThemeListTool(state);
		const { ctx } = makeCtx({ success: true });
		const result = await tool.execute("tool-3", {}, undefined, undefined, ctx as never);

		expect(getText(result)).toContain("dracula");
	});

	it("theme_preview renders a preview without mutating state", async () => {
		const state = makeThemeState("dracula");
		const tool = makeThemePreviewTool(state);
		const { ctx } = makeCtx({ success: true }, "dracula");
		const result = await tool.execute(
			"tool-4",
			{ theme: "nord" },
			undefined,
			undefined,
			ctx as never,
		);

		expect(getText(result)).toContain("nord");
		expect(state.getActive()).toBe("dracula");
	});
});
