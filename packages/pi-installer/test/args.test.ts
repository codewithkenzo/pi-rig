import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { getSkillBundles } from "../src/lib.js";
import { defaultInstallerArgs, parseInstallerArgs, resolveSelectedExtensions } from "../src/args.js";

describe("parseInstallerArgs", () => {
	it("parses --all and --dry-run", () => {
		const parsed = parseInstallerArgs(["--all", "--dry-run"]);
		expect(parsed.all).toBe(true);
		expect(parsed.dryRun).toBe(true);
		expect(parsed.installSkills).toBe(true);
	});

	it("parses explicit extension selection and no-skills", () => {
		const parsed = parseInstallerArgs([
			"--extensions",
			"flow-system,theme-switcher",
			"--no-skills",
			"--pi-path",
			"/custom/pi",
		]);

		expect(parsed.extensions).toEqual(["flow-system", "theme-switcher"]);
		expect(parsed.installSkills).toBe(false);
		expect(parsed.piPath).toBe("/custom/pi");
	});

	it("defaults to skills enabled and no flags", () => {
		expect(defaultInstallerArgs()).toEqual({
			all: false,
			extensions: null,
			piPath: null,
			dryRun: false,
			skipInstall: false,
			installSkills: true,
		});
	});
});

describe("resolveSelectedExtensions", () => {
	it("returns explicit filtered extensions when provided", () => {
		const selected = resolveSelectedExtensions(
			["flow-system", "theme-switcher", "fs-sandbox"],
			parseInstallerArgs(["--extensions", "theme-switcher,fs-sandbox"]),
		);

		expect(selected).toEqual(["theme-switcher", "fs-sandbox"]);
	});

	it("returns all extensions with --all", () => {
		const selected = resolveSelectedExtensions(
			["flow-system", "theme-switcher"],
			parseInstallerArgs(["--all"]),
		);

		expect(selected).toEqual(["flow-system", "theme-switcher"]);
	});
});

describe("getSkillBundles", () => {
	it("finds bundled flow-system skill", async () => {
		const root = resolve(process.cwd(), "..", "..");
		const bundles = await getSkillBundles(root, "flow-system");
		expect(bundles.some((bundle) => bundle.path.endsWith("extensions/flow-system/skills/flow-system"))).toBe(
			true,
		);
	});

	it("returns empty array for missing skill bundle", async () => {
		const root = resolve(process.cwd(), "..", "..");
		const bundles = await getSkillBundles(root, "missing-plugin");
		expect(bundles).toHaveLength(0);
	});

	it("detects gateway and notify-cron skill bundles", async () => {
		const root = resolve(process.cwd(), "..", "..");
		const gateway = await getSkillBundles(root, "gateway-messaging");
		const notifyCron = await getSkillBundles(root, "notify-cron");
		expect(gateway.some((bundle) => bundle.name === "gateway-messaging")).toBe(true);
		expect(notifyCron.some((bundle) => bundle.name === "notify-cron")).toBe(true);
	});
});
