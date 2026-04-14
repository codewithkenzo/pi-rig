import { describe, expect, it } from "bun:test";
import { Cause, Effect, Exit } from "effect";
import { BUILTIN_PALETTES, PALETTE_MAP } from "../../../shared/theme/index.js";
import { makeThemeState, applyTheme, syncThemeStateFromUi } from "../src/state.js";
import { ThemeLoadError, ThemeNotFoundError } from "../src/types.js";

const makeCtx = (result: { success: boolean; error?: string }) => {
	const emitted: Array<{ event: string; payload?: unknown }> = [];
	const ctx = {
		ui: {
			setTheme: () => result,
			theme: { name: "catppuccin-mocha" },
		},
		events: {
			emit: (event: string, payload?: unknown) => {
				emitted.push({ event, payload });
			},
		},
	};
	return { ctx, emitted };
};

describe("makeThemeState", () => {
	it("returns the initial active theme", () => {
		const state = makeThemeState("dracula");
		expect(state.getActive()).toBe("dracula");
	});

	it("syncThemeStateFromUi adopts the ui theme name", () => {
		const state = makeThemeState("dracula");
		expect(syncThemeStateFromUi(state, "nord")).toBe("nord");
		expect(state.getActive()).toBe("nord");
	});

	it("getNextName advances and wraps across built-in palettes", () => {
		const names = BUILTIN_PALETTES.map((palette) => palette.name);
		const first = names[0] ?? "catppuccin-mocha";
		const second = names[1] ?? first;
		const last = names[names.length - 1] ?? first;
		const state = makeThemeState(last);

		expect(state.getNextName()).toBe(first);

		state.setActive(first);
		expect(state.getNextName()).toBe(second);
	});

	it("getNextName includes extra registered themes from the shared palette map", () => {
		const names = BUILTIN_PALETTES.map((palette) => palette.name);
		const first = names[0] ?? "catppuccin-mocha";
		const last = names[names.length - 1] ?? first;
		const extraName = "zz-test-extra-theme";

		PALETTE_MAP.set(extraName, {
			...BUILTIN_PALETTES[0]!,
			name: extraName,
		});

		try {
			const state = makeThemeState(last);
			expect(state.getNextName()).toBe(extraName);

			state.setActive(extraName);
			expect(state.getNextName()).toBe(first);
		} finally {
			PALETTE_MAP.delete(extraName);
		}
	});
});

describe("applyTheme", () => {
	it("updates state and emits theme:changed on success", async () => {
		const state = makeThemeState("catppuccin-mocha");
		const { ctx, emitted } = makeCtx({ success: true });

		const exit = await Effect.runPromiseExit(applyTheme(ctx, "dracula", state));

		expect(Exit.isSuccess(exit)).toBe(true);
		expect(state.getActive()).toBe("dracula");
		expect(emitted).toEqual([{ event: "theme:changed", payload: { theme: "dracula" } }]);
	});

	it("returns ThemeLoadError and leaves state unchanged when setTheme fails", async () => {
		const state = makeThemeState("catppuccin-mocha");
		const { ctx } = makeCtx({ success: false, error: "unknown theme" });

		const exit = await Effect.runPromiseExit(applyTheme(ctx, "dracula", state));

		expect(Exit.isFailure(exit)).toBe(true);
		expect(state.getActive()).toBe("catppuccin-mocha");
		if (Exit.isFailure(exit)) {
			const reason = exit.cause.reasons.find(Cause.isFailReason);
			if (reason !== undefined) {
				const error = reason.error;
				expect(error).toBeInstanceOf(ThemeLoadError);
				if (error instanceof ThemeLoadError) {
					expect(error.reason).toContain("unknown theme");
				}
			}
		}
	});

	it("returns ThemeNotFoundError when theme is unknown before setTheme", async () => {
		const state = makeThemeState("catppuccin-mocha");
		const { ctx } = makeCtx({ success: true });

		const exit = await Effect.runPromiseExit(applyTheme(ctx, "missing-theme", state));

		expect(Exit.isFailure(exit)).toBe(true);
		expect(state.getActive()).toBe("catppuccin-mocha");
		if (Exit.isFailure(exit)) {
			const reason = exit.cause.reasons.find(Cause.isFailReason);
			if (reason !== undefined) {
				expect(reason.error).toBeInstanceOf(ThemeNotFoundError);
			}
		}
	});
});
