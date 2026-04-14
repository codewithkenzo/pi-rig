import { describe, it, expect } from "bun:test";
import { Effect, Exit } from "effect";
import { loadProfiles, getProfile, BUILT_IN_PROFILES } from "../src/profiles.js";
import { ProfileNotFoundError } from "../src/types.js";

const NO_CONFIG_DIR = "/tmp";

describe("BUILT_IN_PROFILES", () => {
	it("contains exactly 6 profiles", () => {
		expect(BUILT_IN_PROFILES).toHaveLength(6);
	});

	it("has the expected profile names", () => {
		const names = BUILT_IN_PROFILES.map((p) => p.name);
		expect(names).toEqual(["explore", "research", "coder", "debug", "browser", "ambivalent"]);
	});
});

describe("loadProfiles", () => {
	it("returns 6 profiles when no config files exist", () => {
		const profiles = loadProfiles(NO_CONFIG_DIR);
		expect(profiles).toHaveLength(6);
	});

	it("returns profiles with the expected built-in names", () => {
		const profiles = loadProfiles(NO_CONFIG_DIR);
		const names = profiles.map((p) => p.name);
		expect(names).toContain("explore");
		expect(names).toContain("research");
		expect(names).toContain("coder");
		expect(names).toContain("debug");
		expect(names).toContain("browser");
		expect(names).toContain("ambivalent");
	});

	it("explore profile has reasoning_level low and max_iterations 11", () => {
		const profiles = loadProfiles(NO_CONFIG_DIR);
		const explore = profiles.find((p) => p.name === "explore");
		expect(explore).toBeDefined();
		expect(explore?.reasoning_level).toBe("low");
		expect(explore?.max_iterations).toBe(11);
		expect(explore?.toolsets).toEqual(["terminal", "file"]);
	});

	it("coder profile has max_iterations 35 and toolsets code_execution", () => {
		const profiles = loadProfiles(NO_CONFIG_DIR);
		const coder = profiles.find((p) => p.name === "coder");
		expect(coder?.max_iterations).toBe(35);
		expect(coder?.toolsets).toEqual(["code_execution"]);
	});

	it("debug profile has reasoning_level high and empty toolsets", () => {
		const profiles = loadProfiles(NO_CONFIG_DIR);
		const debug = profiles.find((p) => p.name === "debug");
		expect(debug?.reasoning_level).toBe("high");
		expect(debug?.toolsets).toEqual([]);
	});

	it("all built-in profiles have empty skills arrays", () => {
		const profiles = loadProfiles(NO_CONFIG_DIR);
		for (const profile of profiles) {
			expect(profile.skills).toEqual([]);
		}
	});

	it("silently skips a cwd with no .pi directory", () => {
		// Should not throw; returns built-ins unchanged
		const profiles = loadProfiles("/tmp/nonexistent-dir-that-does-not-exist-xyz");
		expect(profiles).toHaveLength(6);
	});
});

describe("getProfile", () => {
	it("resolves explore with reasoning_level low", async () => {
		const profile = await Effect.runPromise(getProfile("explore", NO_CONFIG_DIR));
		expect(profile.name).toBe("explore");
		expect(profile.reasoning_level).toBe("low");
	});

	it("resolves research with toolsets terminal, file, web", async () => {
		const profile = await Effect.runPromise(getProfile("research", NO_CONFIG_DIR));
		expect(profile.toolsets).toEqual(["terminal", "file", "web"]);
	});

	it("fails with ProfileNotFoundError for unknown profile name", async () => {
		const exit = await Effect.runPromiseExit(getProfile("nonexistent", NO_CONFIG_DIR));
		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) {
			const cause = exit.cause;
			// The failure should be a ProfileNotFoundError
			expect(cause._tag).toBe("Fail");
			if (cause._tag === "Fail") {
				const error = cause.error;
				expect(error).toBeInstanceOf(ProfileNotFoundError);
				expect((error as ProfileNotFoundError).name).toBe("nonexistent");
			}
		}
	});

	it("resolves coder profile correctly", async () => {
		const profile = await Effect.runPromise(getProfile("coder", NO_CONFIG_DIR));
		expect(profile.max_iterations).toBe(35);
		expect(profile.reasoning_level).toBe("medium");
	});

	it("resolves ambivalent with empty toolsets", async () => {
		const profile = await Effect.runPromise(getProfile("ambivalent", NO_CONFIG_DIR));
		expect(profile.toolsets).toEqual([]);
		expect(profile.reasoning_level).toBe("medium");
	});
});
