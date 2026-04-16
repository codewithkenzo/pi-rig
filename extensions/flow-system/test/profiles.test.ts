import { describe, it, expect } from "bun:test";
import * as fs from "node:fs";
import { Effect } from "effect";
import { loadProfiles, getProfile, BUILT_IN_PROFILES } from "../src/profiles.js";
import { ProfileNotFoundError } from "../src/types.js";

const NO_CONFIG_DIR = `/tmp/pi-flow-profiles-test-${crypto.randomUUID()}`;

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

	it("explore profile has reasoning_level low and sane default model lanes", () => {
		const profiles = loadProfiles(NO_CONFIG_DIR);
		const explore = profiles.find((p) => p.name === "explore");
		expect(explore).toBeDefined();
		expect(explore?.reasoning_level).toBe("low");
		expect(explore?.model).toBe("gpt-5.4-mini");
		expect(explore?.models).toEqual(["claude-haiku-4-5", "gemini-2.5-flash"]);
		expect(explore?.toolsets).toEqual(["terminal", "file"]);
	});

	it("coder profile uses high reasoning and coding-focused model defaults", () => {
		const profiles = loadProfiles(NO_CONFIG_DIR);
		const coder = profiles.find((p) => p.name === "coder");
		expect(coder?.reasoning_level).toBe("high");
		expect(coder?.model).toBe("gpt-5.4-mini");
		expect(coder?.models).toEqual(["gpt-5.3-codex", "claude-sonnet-4-6"]);
		expect(coder?.toolsets).toEqual(["code_execution"]);
	});

	it("debug profile has reasoning_level xhigh and reviewer model defaults", () => {
		const profiles = loadProfiles(NO_CONFIG_DIR);
		const debug = profiles.find((p) => p.name === "debug");
		expect(debug?.reasoning_level).toBe("xhigh");
		expect(debug?.model).toBe("gpt-5.4");
		expect(debug?.models).toEqual(["claude-opus-4-1", "claude-sonnet-4-6"]);
		expect(debug?.toolsets).toEqual([]);
	});

	it("all built-in profiles have empty skills arrays", () => {
		const profiles = loadProfiles(NO_CONFIG_DIR);
		for (const profile of profiles) {
			expect(profile.skills).toEqual([]);
		}
	});

	it("normalizes legacy max_iterations from custom profile overrides", () => {
		const cwd = `/tmp/pi-flow-profiles-test-${crypto.randomUUID()}`;
		const piDir = `${cwd}/.pi`;
		fs.mkdirSync(piDir, { recursive: true });
		Bun.write(`${piDir}/flow-profiles.json`, JSON.stringify([
			{
				name: "legacy-custom",
				reasoning_level: "medium",
				max_iterations: 15,
				toolsets: ["terminal"],
				skills: [],
			},
		], null, 2));
		const profiles = loadProfiles(cwd);
		const custom = profiles.find((profile) => profile.name === "legacy-custom");
		expect(custom).toBeDefined();
		expect(custom?.reasoning_level).toBe("medium");
		expect(custom?.toolsets).toEqual(["terminal"]);
		expect((custom as { max_iterations?: unknown })?.max_iterations).toBeUndefined();
	});

	it("does not inherit a model override for partial built-in overrides", () => {
		const cwd = `/tmp/pi-flow-profiles-test-${crypto.randomUUID()}`;
		const piDir = `${cwd}/.pi`;
		fs.mkdirSync(piDir, { recursive: true });
		Bun.write(`${piDir}/flow-profiles.json`, JSON.stringify([
			{
				name: "explore",
				reasoning_level: "low",
				toolsets: ["terminal", "file"],
				skills: [],
			},
		], null, 2));
		const profiles = loadProfiles(cwd);
		const explore = profiles.find((profile) => profile.name === "explore");
		expect(explore?.model).toBeUndefined();
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
		const result = await Effect.runPromise(
			getProfile("nonexistent", NO_CONFIG_DIR).pipe(Effect.result),
		);
		expect(result._tag).toBe("Failure");
		if (result._tag === "Failure") {
			expect(result.failure).toBeInstanceOf(ProfileNotFoundError);
			expect(result.failure.name).toBe("nonexistent");
		}
	});

	it("resolves coder profile correctly", async () => {
		const profile = await Effect.runPromise(getProfile("coder", NO_CONFIG_DIR));
		expect(profile.reasoning_level).toBe("high");
		expect(profile.model).toBe("gpt-5.4-mini");
	});

	it("resolves ambivalent with empty toolsets", async () => {
		const profile = await Effect.runPromise(getProfile("ambivalent", NO_CONFIG_DIR));
		expect(profile.toolsets).toEqual([]);
		expect(profile.reasoning_level).toBe("medium");
	});
});
