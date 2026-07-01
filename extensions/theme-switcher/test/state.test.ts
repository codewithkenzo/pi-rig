import { describe, expect, it } from "bun:test";
import type { Theme } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Cause, Effect, Exit } from "effect";
import { BUILTIN_PALETTES, PALETTE_MAP } from "../../../shared/theme/index.js";
import {
	makeThemeState,
	applyTheme,
	syncThemeStateFromUi,
	loadThemePreference,
	saveThemePreference,
} from "../src/state.js";
import { ThemeLoadError } from "../src/types.js";

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

const makeCtx = (result: { success: boolean; error?: string }) => {
	const emitted: Array<{ event: string; payload?: unknown }> = [];
	const setThemeCalls: Array<string | Theme> = [];
	const ctx = {
		ui: {
			setTheme: (theme: string | Theme) => {
				setThemeCalls.push(theme);
				return result;
			},
			theme: new MockTheme(undefined, undefined, undefined, { name: "catppuccin-mocha" }) as Theme,
		},
		events: {
			emit: (event: string, payload?: unknown) => {
				emitted.push({ event, payload });
			},
		},
	};
	return { ctx, emitted, setThemeCalls };
};

const coreSettingsPath = (dir: string): string =>
	path.join(dir, "settings.json");

const extensionSettingsPath = (dir: string): string =>
	path.join(dir, "theme-switcher.json");

const writeJson = (file: string, value: Record<string, unknown>): void => {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const writeCoreSettings = (dir: string, value: Record<string, unknown>): void => {
	writeJson(coreSettingsPath(dir), value);
};

const writeExtensionSettings = (dir: string, value: Record<string, unknown>): void => {
	writeJson(extensionSettingsPath(dir), value);
};

const readJson = (file: string): Record<string, unknown> => {
	const raw = fs.readFileSync(file, "utf8");
	return JSON.parse(raw) as Record<string, unknown>;
};

const readCoreSettings = (dir: string): Record<string, unknown> => readJson(coreSettingsPath(dir));

const readExtensionSettings = (dir: string): Record<string, unknown> => readJson(extensionSettingsPath(dir));

const withTempSettings = async <T>(run: (dir: string) => Promise<T> | T): Promise<T> => {
	const prevCorePath = process.env["PI_THEME_SETTINGS_PATH"];
	const prevExtensionPath = process.env["PI_THEME_SWITCHER_SETTINGS_PATH"];
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "theme-switcher-settings-"));
	process.env["PI_THEME_SETTINGS_PATH"] = coreSettingsPath(dir);
	process.env["PI_THEME_SWITCHER_SETTINGS_PATH"] = extensionSettingsPath(dir);
	try {
		return await run(dir);
	} finally {
		if (prevCorePath === undefined) {
			delete process.env["PI_THEME_SETTINGS_PATH"];
		} else {
			process.env["PI_THEME_SETTINGS_PATH"] = prevCorePath;
		}
		if (prevExtensionPath === undefined) {
			delete process.env["PI_THEME_SWITCHER_SETTINGS_PATH"];
		} else {
			process.env["PI_THEME_SWITCHER_SETTINGS_PATH"] = prevExtensionPath;
		}
		fs.rmSync(dir, { recursive: true, force: true });
	}
};

describe("makeThemeState", () => {
	it("returns the initial active theme", () => {
		const state = makeThemeState("dracula");
		expect(state.getActive()).toBe("dracula");
	});

	it("preserves explicit non-palette initial names for installed-theme restore", () => {
		const state = makeThemeState("my-installed-theme");
		expect(state.getActive()).toBe("my-installed-theme");
	});

	it("syncThemeStateFromUi adopts the ui theme name", () => {
		const state = makeThemeState("dracula");
		expect(syncThemeStateFromUi(state, "nord")).toBe("nord");
		expect(state.getActive()).toBe("nord");
	});

	it("syncThemeStateFromUi keeps the current dark palette when ui reports dark alias", () => {
		const state = makeThemeState("dracula");
		expect(syncThemeStateFromUi(state, "dark")).toBe("dracula");
		expect(state.getActive()).toBe("dracula");
	});

	it("syncThemeStateFromUi resolves ui dark alias to a concrete dark palette when needed", () => {
		const state = makeThemeState("catppuccin-latte");
		expect(syncThemeStateFromUi(state, "dark")).toBe("catppuccin-mocha");
		expect(state.getActive()).toBe("catppuccin-mocha");
	});

	it("syncThemeStateFromUi preserves unknown ui theme names for installed-theme persistence", () => {
		const state = makeThemeState("nord");
		expect(syncThemeStateFromUi(state, "not-a-real-theme")).toBe("not-a-real-theme");
		expect(state.getActive()).toBe("not-a-real-theme");
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

describe("theme preference persistence", () => {
	it("loadThemePreference prefers extension-owned settings", async () => {
		await withTempSettings((dir) => {
			writeCoreSettings(dir, {
				theme: "dracula",
				defaultModel: "gpt-5.4-mini",
			});
			writeExtensionSettings(dir, { active: "hyrule" });

			expect(loadThemePreference()).toBe("hyrule");
			expect(readCoreSettings(dir)["theme"]).toBe("dracula");
		});
	});

	it("loadThemePreference migrates stale known palette names out of Pi core settings", async () => {
		await withTempSettings((dir) => {
			writeCoreSettings(dir, {
				theme: "hyrule",
				defaultModel: "gpt-5.4-mini",
				autoUpdate: true,
			});

			expect(loadThemePreference()).toBe("hyrule");
			expect(readExtensionSettings(dir)["active"]).toBe("hyrule");
			const core = readCoreSettings(dir);
			expect(core["theme"]).toBeUndefined();
			expect(core["defaultModel"]).toBe("gpt-5.4-mini");
			expect(core["autoUpdate"]).toBe(true);
		});
	});

	it("loadThemePreference leaves unknown Pi core theme names untouched", async () => {
		await withTempSettings((dir) => {
			writeCoreSettings(dir, {
				theme: "my-core-theme",
				defaultModel: "gpt-5.4-mini",
			});

			expect(loadThemePreference()).toBe("my-core-theme");
			expect(readCoreSettings(dir)["theme"]).toBe("my-core-theme");
			expect(fs.existsSync(extensionSettingsPath(dir))).toBe(false);
		});
	});

	it("saveThemePreference writes extension settings and scrubs matching core palette theme only", async () => {
		await withTempSettings((dir) => {
			writeCoreSettings(dir, {
				theme: "hyrule",
				defaultModel: "gpt-5.4-mini",
				autoUpdate: true,
			});

			saveThemePreference("hyrule");
			expect(readExtensionSettings(dir)["active"]).toBe("hyrule");
			const core = readCoreSettings(dir);
			expect(core["theme"]).toBeUndefined();
			expect(core["defaultModel"]).toBe("gpt-5.4-mini");
			expect(core["autoUpdate"]).toBe(true);
		});
	});

	it("saveThemePreference does not scrub unrelated core theme names", async () => {
		await withTempSettings((dir) => {
			writeCoreSettings(dir, {
				theme: "my-core-theme",
				defaultModel: "gpt-5.4-mini",
			});

			saveThemePreference("hyrule");
			expect(readExtensionSettings(dir)["active"]).toBe("hyrule");
			expect(readCoreSettings(dir)["theme"]).toBe("my-core-theme");
		});
	});
});

describe("applyTheme", () => {
	it("updates state, emits theme:changed, and persists settings on success", async () => {
		await withTempSettings(async (dir) => {
			writeCoreSettings(dir, {
				theme: "catppuccin-mocha",
				defaultModel: "gpt-5.4-mini",
			});

			const state = makeThemeState("catppuccin-mocha");
			const { ctx, emitted, setThemeCalls } = makeCtx({ success: true });

			const exit = await Effect.runPromiseExit(applyTheme(ctx, "dracula", state));

			expect(Exit.isSuccess(exit)).toBe(true);
			expect(state.getActive()).toBe("dracula");
			expect(typeof setThemeCalls[0]).not.toBe("string");
			expect((setThemeCalls[0] as Theme | undefined)?.name).toBe("dracula");
			expect(emitted).toEqual([{ event: "theme:changed", payload: { theme: "dracula" } }]);

			const saved = readCoreSettings(dir);
			expect(readExtensionSettings(dir)["active"]).toBe("dracula");
			expect(saved["theme"]).toBe("catppuccin-mocha");
			expect(saved["defaultModel"]).toBe("gpt-5.4-mini");
		});
	});

	it("can skip preference writes when persistPreference is disabled", async () => {
		await withTempSettings(async (dir) => {
			writeCoreSettings(dir, {
				theme: "catppuccin-mocha",
				defaultModel: "gpt-5.4-mini",
			});

			const state = makeThemeState("catppuccin-mocha");
			const { ctx } = makeCtx({ success: true });
			const exit = await Effect.runPromiseExit(
				applyTheme(ctx, "dracula", state, { persistPreference: false }),
			);
			expect(Exit.isSuccess(exit)).toBe(true);

			const saved = readCoreSettings(dir);
			expect(saved["theme"]).toBe("catppuccin-mocha");
			expect(state.getActive()).toBe("dracula");
		});
	});

	it("returns ThemeLoadError, keeps state, and does not persist on failed apply", async () => {
		await withTempSettings(async (dir) => {
			writeCoreSettings(dir, {
				theme: "catppuccin-mocha",
				defaultModel: "gpt-5.4-mini",
			});

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

			const saved = readCoreSettings(dir);
			expect(saved["theme"]).toBe("catppuccin-mocha");
			expect(saved["defaultModel"]).toBe("gpt-5.4-mini");
		});
	});

	it("preserves unknown theme names when the UI can accept them", async () => {
		const state = makeThemeState("catppuccin-mocha");
		const { ctx, setThemeCalls } = makeCtx({ success: true });

		const exit = await Effect.runPromiseExit(applyTheme(ctx, "missing-theme", state));

		expect(Exit.isSuccess(exit)).toBe(true);
		expect(state.getActive()).toBe("missing-theme");
		expect(setThemeCalls[0]).toBe("missing-theme");
	});
});
