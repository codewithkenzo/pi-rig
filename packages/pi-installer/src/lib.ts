import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { InstallerArgs } from "./args.js";

export interface InstallerIO {
	log(message: string): void;
}

export interface ExtensionInstallResult {
	name: string;
	ready: boolean;
	skillInstalled: boolean;
}

export interface InstallerResult {
	results: ExtensionInstallResult[];
	piPath: string | null;
}

export interface ExtensionCatalogEntry {
	id: string;
	label: string;
	description: string;
	packageName: string;
	availableNow: boolean;
	aliases: readonly string[];
}

const NO_COLOR = process.env.NO_COLOR === "1";
const USE_ASCII_ICONS = process.env.PI_ASCII_ICONS === "1" || process.env.TERM === "dumb";

const fg = (hex: string, text: string): string => {
	if (NO_COLOR) return text;
	const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
	if (normalized.length !== 6) return text;
	const r = Number.parseInt(normalized.slice(0, 2), 16);
	const g = Number.parseInt(normalized.slice(2, 4), 16);
	const b = Number.parseInt(normalized.slice(4, 6), 16);
	return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
};

const COLORS = {
	green: (text: string) => fg("#3B82F6", text),
	blue: (text: string) => fg("#8B5CF6", text),
	yellow: (text: string) => fg("#A1A1AA", text),
	red: (text: string) => fg("#DC2626", text),
	text: (text: string) => fg("#E4E4E7", text),
	dim: (text: string) => fg("#52525B", text),
	bold: (text: string) => (NO_COLOR ? text : `\x1b[1m${text}\x1b[22m`),
};

const ICONS = USE_ASCII_ICONS
	? {
			app: "[pi-rig]",
			step: "->",
			ok: "[ok]",
			warn: "[!]",
			error: "[x]",
			info: "[i]",
			pkg: "[pkg]",
			pi: "[pi]",
		}
	: {
			app: "",
			step: "➜",
			ok: "",
			warn: "",
			error: "",
			info: "",
			pkg: "󰏗",
			pi: "",
		};

export const EXTENSION_CATALOG: readonly ExtensionCatalogEntry[] = [
	{
		id: "flow-system",
		label: "Pi Dispatch",
		description: "Queue and run Pi tasks with reusable profiles",
		packageName: "@codewithkenzo/pi-dispatch",
		availableNow: true,
		aliases: ["flow-system", "dispatch", "pi-dispatch", "@codewithkenzo/pi-dispatch"],
	},
	{
		id: "theme-switcher",
		label: "Theme Switcher",
		description: "Switch and preview Pi themes in a live session",
		packageName: "@codewithkenzo/pi-theme-switcher",
		availableNow: true,
		aliases: ["theme-switcher", "theme", "pi-theme-switcher", "@codewithkenzo/pi-theme-switcher"],
	},
];

const catalogById = new Map(EXTENSION_CATALOG.map((entry) => [entry.id, entry]));

const aliasToId = new Map(
	EXTENSION_CATALOG.flatMap((entry) =>
		entry.aliases.map((alias) => [alias.trim().toLowerCase(), entry.id] as const),
	),
);

export const createConsoleIO = (): InstallerIO => ({
	log: (message: string) => console.log(message),
});

export const getAvailableExtensions = (): ExtensionCatalogEntry[] =>
	EXTENSION_CATALOG.filter((entry) => entry.availableNow);

export const getComingSoonExtensions = (): ExtensionCatalogEntry[] =>
	EXTENSION_CATALOG.filter((entry) => !entry.availableNow);

export const getExtensionMetadata = (id: string): ExtensionCatalogEntry | null =>
	catalogById.get(id) ?? null;

export const resolveExtensionToken = (token: string): string | null => {
	const normalized = token.trim().toLowerCase();
	if (normalized.length === 0) return null;
	if (catalogById.has(normalized)) return normalized;
	return aliasToId.get(normalized) ?? null;
};

export const discoverExtensions = async (root: string): Promise<string[]> => {
	const extensionsDir = join(root, "extensions");
	if (!existsSync(extensionsDir)) return [];

	const entries = await readdir(extensionsDir, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.filter((name) => {
			const extDir = join(extensionsDir, name);
			return existsSync(join(extDir, "package.json")) && existsSync(join(extDir, "index.ts"));
		})
		.sort();
};

export interface SkillBundle {
	name: string;
	path: string;
}

export const getSkillBundles = async (root: string, extension: string): Promise<SkillBundle[]> => {
	const bundles: SkillBundle[] = [];
	const skillsRoot = join(root, "extensions", extension, "skills");
	if (existsSync(skillsRoot)) {
		const entries = await readdir(skillsRoot, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const bundlePath = join(skillsRoot, entry.name);
			if (existsSync(join(bundlePath, "SKILL.md"))) {
				bundles.push({ name: entry.name, path: bundlePath });
			}
		}
	}

	const legacyBundle = join(root, "extensions", extension, "skill");
	const legacyNestedBundle = join(legacyBundle, extension);
	if (existsSync(join(legacyNestedBundle, "SKILL.md"))) {
		bundles.push({ name: extension, path: legacyNestedBundle });
	} else if (existsSync(join(legacyBundle, "SKILL.md"))) {
		bundles.push({ name: extension, path: legacyBundle });
	}

	return bundles;
};

const runCommand = async (
	command: string,
	args: string[],
	options: { cwd: string; dryRun: boolean; io: InstallerIO },
): Promise<boolean> => {
	if (options.dryRun) {
		options.io.log(COLORS.dim(`  [dry-run] ${command} ${args.join(" ")}`.trim()));
		return true;
	}

	return await new Promise<boolean>((resolve) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			stdio: "inherit",
		});

		child.once("exit", (code: number | null) => resolve(code === 0));
		child.once("error", () => resolve(false));
	});
};

export const findPiBinary = async (piPath: string | null): Promise<string | null> => {
	if (piPath !== null) return piPath;

	const candidates = [
		"pi",
		join(homedir(), ".pi", "bin", "pi"),
		"/usr/local/bin/pi",
		"/opt/pi/bin/pi",
	];

	for (const candidate of candidates) {
		if (existsSync(candidate)) return candidate;

		const found = await new Promise<boolean>((resolve) => {
			const child = spawn("which", [candidate], { stdio: "ignore" });
			child.once("exit", (code: number | null) => resolve(code === 0));
			child.once("error", () => resolve(false));
		});
		if (found) return candidate;
	}

	return null;
};

const installSkillBundles = async (
	root: string,
	extension: string,
	dryRun: boolean,
	io: InstallerIO,
): Promise<boolean> => {
	const bundles = await getSkillBundles(root, extension);
	if (bundles.length === 0) return false;

	if (!dryRun) {
		await mkdir(join(homedir(), ".pi", "skills"), { recursive: true });
	}
	for (const bundle of bundles) {
		const targetDir = join(homedir(), ".pi", "skills", bundle.name);
		if (dryRun) {
			io.log(COLORS.dim(`  [dry-run] copy ${bundle.path} -> ${targetDir}`));
			continue;
		}
		await rm(targetDir, { recursive: true, force: true });
		await cp(bundle.path, targetDir, { recursive: true, force: true });
	}
	return true;
};

const isSourceWorkspace = (root: string): boolean =>
	existsSync(join(root, "extensions")) && existsSync(join(root, "shared"));

const runSourceInstaller = async (
	root: string,
	selectedExtensions: readonly string[],
	args: InstallerArgs,
	io: InstallerIO,
): Promise<InstallerResult> => {
	if (!args.skipInstall) {
		io.log(COLORS.blue(`  ${ICONS.step} Installing workspace dependencies...`));
		const installed = await runCommand("bun", ["install"], { cwd: root, dryRun: args.dryRun, io });
		if (!installed) {
			throw new Error("bun install failed");
		}
	}

	io.log(COLORS.blue(`  ${ICONS.step} Typechecking shared/...`));
	await runCommand("bun", ["tsc", "--noEmit"], { cwd: join(root, "shared"), dryRun: args.dryRun, io });

	const results: ExtensionInstallResult[] = [];
	for (const extension of selectedExtensions) {
		const metadata = getExtensionMetadata(extension);
		const label = metadata?.label ?? extension;
		const extensionDir = join(root, "extensions", extension);
		io.log(COLORS.blue(`  ${ICONS.pkg} Preparing ${label} (${extension})...`));

		if (!existsSync(extensionDir)) {
			io.log(COLORS.red(`    extension path not found: ${extensionDir}`));
			results.push({ name: extension, ready: false, skillInstalled: false });
			continue;
		}

		if (!args.skipInstall) {
			const installOk = await runCommand("bun", ["install"], {
				cwd: extensionDir,
				dryRun: args.dryRun,
				io,
			});
			if (!installOk) {
				results.push({ name: extension, ready: false, skillInstalled: false });
				continue;
			}
		}

		await runCommand("bun", ["tsc", "--noEmit"], {
			cwd: extensionDir,
			dryRun: args.dryRun,
			io,
		});

		const buildOk = await runCommand("bun", ["run", "build"], {
			cwd: extensionDir,
			dryRun: args.dryRun,
			io,
		});
		if (!buildOk) {
			results.push({ name: extension, ready: false, skillInstalled: false });
			continue;
		}

		const skillInstalled = args.installSkills
			? await installSkillBundles(root, extension, args.dryRun, io)
			: false;

		results.push({ name: extension, ready: true, skillInstalled });
	}

	const piBinary = await findPiBinary(args.piPath);
	if (piBinary !== null) {
		io.log(COLORS.blue(`  ${ICONS.pi} Installing selected extensions into Pi via ${piBinary}...`));
		for (const result of results) {
			if (!result.ready) continue;
			await runCommand(piBinary, ["install", join(root, "extensions", result.name)], {
				cwd: root,
				dryRun: args.dryRun,
				io,
			});
		}
	} else {
		io.log(COLORS.yellow(`  ${ICONS.warn} Pi coding agent binary not found — skipping extension install`));
	}

	return { results, piPath: piBinary };
};

const runPackageInstaller = async (
	root: string,
	selectedExtensions: readonly string[],
	args: InstallerArgs,
	io: InstallerIO,
): Promise<InstallerResult> => {
	io.log(COLORS.blue(`  ${ICONS.info} Package mode detected (no local extensions workspace).`));
	io.log(COLORS.dim("    Installing published plugins only."));

	const piBinary = await findPiBinary(args.piPath);
	if (piBinary === null) {
		io.log(COLORS.yellow(`  ${ICONS.warn} Pi coding agent binary not found — skipping extension install`));
		return {
			results: selectedExtensions.map((name) => ({ name, ready: false, skillInstalled: false })),
			piPath: null,
		};
	}

	const results: ExtensionInstallResult[] = [];
	for (const extension of selectedExtensions) {
		const metadata = getExtensionMetadata(extension);
		if (metadata === null) {
			io.log(COLORS.red(`  ${ICONS.error} Unknown plugin: ${extension}`));
			results.push({ name: extension, ready: false, skillInstalled: false });
			continue;
		}
		if (!metadata.availableNow) {
			io.log(COLORS.yellow(`  ${ICONS.warn} ${metadata.label} is coming soon — skipping for now.`));
			results.push({ name: extension, ready: false, skillInstalled: false });
			continue;
		}

		io.log(COLORS.blue(`  ${ICONS.pkg} Installing ${metadata.label} (${metadata.packageName})...`));
		const installOk = await runCommand(piBinary, ["install", metadata.packageName], {
			cwd: root,
			dryRun: args.dryRun,
			io,
		});
		results.push({ name: extension, ready: installOk, skillInstalled: installOk });
	}

	return { results, piPath: piBinary };
};

export const runInstaller = async (
	root: string,
	selectedExtensions: readonly string[],
	args: InstallerArgs,
	io: InstallerIO,
): Promise<InstallerResult> => {
	io.log("");
	io.log(COLORS.bold(COLORS.blue(`  ${ICONS.app} @codewithkenzo/pi-rig`)));
	io.log(COLORS.dim("  Install Pi Dispatch + Theme Switcher in one command · Electric Midnight by Kenzo"));
	io.log("");

	if (selectedExtensions.length === 0) {
		io.log(COLORS.yellow(`  ${ICONS.warn} No plugins selected.`));
		return { results: [], piPath: null };
	}

	if (isSourceWorkspace(root)) {
		return await runSourceInstaller(root, selectedExtensions, args, io);
	}

	return await runPackageInstaller(root, selectedExtensions, args, io);
};
