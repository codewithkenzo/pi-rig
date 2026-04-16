import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
	createConsoleIO,
	discoverExtensions,
	getAvailableExtensions,
	resolveExtensionToken,
	runInstaller,
	type ExtensionCatalogEntry,
} from "./lib.js";
import { parseInstallerArgs, resolveSelectedExtensions } from "./args.js";

const installerDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(installerDir, "..");
const workspaceRootCandidate = join(packageRoot, "..", "..");
const rootDir =
	existsSync(join(workspaceRootCandidate, "extensions")) &&
	existsSync(join(workspaceRootCandidate, "shared"))
		? workspaceRootCandidate
		: packageRoot;

const promptForExtensions = async (options: readonly ExtensionCatalogEntry[]): Promise<string[]> => {
	const rl = createInterface({ input: stdin, output: stdout });
	try {
		console.log("");
		console.log("Select plugins to install:");
		options.forEach((entry, index) => {
			console.log(`  ${index + 1}. ${entry.label} (${entry.id}) — ${entry.description}`);
		});
		console.log("  a. all");
		const answer = (await rl.question("Selection (comma-separated numbers or 'a'): ")).trim();
		if (answer.toLowerCase() === "a") {
			return options.map((entry) => entry.id);
		}

		const indexes = answer
			.split(",")
			.map((part) => Number(part.trim()))
			.filter((value) => Number.isInteger(value) && value >= 1 && value <= options.length);

		return Array.from(
			new Set(
				indexes
					.map((value) => options[value - 1]?.id)
					.filter((value): value is string => value !== undefined),
			),
		);
	} finally {
		rl.close();
	}
};

const normalizeRequestedExtensionIds = (
	requested: readonly string[] | null,
	allowedIds: readonly string[],
): { selected: string[]; unknown: string[] } => {
	if (requested === null) return { selected: [], unknown: [] };

	const allowedSet = new Set(allowedIds);
	const selected = new Set<string>();
	const unknown: string[] = [];

	for (const token of requested) {
		const resolved = resolveExtensionToken(token);
		if (resolved !== null && allowedSet.has(resolved)) {
			selected.add(resolved);
			continue;
		}
		unknown.push(token);
	}

	return { selected: [...selected], unknown };
};

export const runCli = async (argv: string[]): Promise<void> => {
	const io = createConsoleIO();
	const args = parseInstallerArgs(argv);
	const localExtensions = await discoverExtensions(rootDir);
	const localSet = new Set(localExtensions);

	const availableCatalog = getAvailableExtensions();
	const installableCatalog = localExtensions.length > 0
		? availableCatalog.filter((entry) => localSet.has(entry.id))
		: availableCatalog;

	if (installableCatalog.length === 0) {
		io.log("No installable plugins found.");
		return;
	}

	io.log("");
	io.log("Available now:");
	for (const entry of installableCatalog) {
		io.log(`  - ${entry.label} (${entry.id})`);
	}
	io.log("  More plugins are planned and will be added in future phases.");

	const allExtensionIds = installableCatalog.map((entry) => entry.id);
	const normalized = normalizeRequestedExtensionIds(args.extensions, allExtensionIds);
	if (args.extensions !== null) {
		args.extensions = normalized.selected;
		if (normalized.unknown.length > 0) {
			io.log("");
			io.log(`Ignoring unknown/unavailable plugin IDs: ${normalized.unknown.join(", ")}`);
		}
	}

	let selected = resolveSelectedExtensions(allExtensionIds, args);
	if (selected.length === 0) {
		if (stdin.isTTY) {
			selected = await promptForExtensions(installableCatalog);
		} else {
			selected = [...allExtensionIds];
		}
	}

	const result = await runInstaller(rootDir, selected, args, io);
	const ready = result.results.filter((entry) => entry.ready).length;
	const withSkills = result.results.filter((entry) => entry.skillInstalled).length;

	io.log("");
	io.log(`  Ready: ${ready}/${result.results.length}`);
	io.log(`  Skills installed: ${withSkills}`);
	if (result.piPath !== null) {
		io.log(`  pi: ${result.piPath}`);
	}
	io.log("  Auth: uses existing Pi provider auth/environment");
	io.log("");
};

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
	await runCli(process.argv.slice(2));
}
