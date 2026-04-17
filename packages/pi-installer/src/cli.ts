#!/usr/bin/env node

import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
	createConsoleIO,
	discoverExtensions,
	getAvailableExtensions,
	getComingSoonExtensions,
	resolveExtensionToken,
	runInstaller,
	type ExtensionCatalogEntry,
} from "./lib.js";
import { parseInstallerArgs, resolveSelectedExtensions } from "./args.js";
import { isTTY } from "./tokens.js";
import {
	renderHeader,
	renderExtensionList,
	renderSelectorPrompt,
	renderAutoSelect,
	renderResults,
} from "./render.js";

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
		const prompt = renderSelectorPrompt();
		const answer = (await rl.question(prompt)).trim();
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

	const comingSoon = getComingSoonExtensions();

	for (const line of renderHeader()) {
		io.log(line);
	}

	const listLines = renderExtensionList(installableCatalog, comingSoon);
	for (const line of listLines) {
		io.log(line);
	}

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
		if (isTTY) {
			selected = await promptForExtensions(installableCatalog);
		} else {
			for (const line of renderAutoSelect(allExtensionIds)) {
				io.log(line);
			}
			selected = [...allExtensionIds];
		}
	}

	const result = await runInstaller(rootDir, selected, args, io);

	for (const line of renderResults(result)) {
		io.log(line);
	}
};

const isMain = (() => {
	const entry = process.argv[1];
	if (entry === undefined) return false;
	try {
		return realpathSync(entry) === fileURLToPath(import.meta.url);
	} catch {
		return false;
	}
})();

if (isMain) {
	await runCli(process.argv.slice(2));
}
