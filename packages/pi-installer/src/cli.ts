import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createConsoleIO, discoverExtensions, runInstaller } from "./lib.js";
import { parseInstallerArgs, resolveSelectedExtensions } from "./args.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const promptForExtensions = async (allExtensions: readonly string[]): Promise<string[]> => {
	const rl = createInterface({ input: stdin, output: stdout });
	try {
		console.log("");
		console.log("Select extension suite modules to install:");
		allExtensions.forEach((extension, index) => {
			console.log(`  ${index + 1}. ${extension}`);
		});
		console.log("  a. all");
		const answer = (await rl.question("Selection (comma-separated numbers or 'a'): ")).trim();
		if (answer.toLowerCase() === "a") {
			return [...allExtensions];
		}

		const indexes = answer
			.split(",")
			.map((part) => Number(part.trim()))
			.filter((value) => Number.isInteger(value) && value >= 1 && value <= allExtensions.length);

		return Array.from(
			new Set(
				indexes
					.map((value) => allExtensions[value - 1])
					.filter((value): value is string => value !== undefined),
			),
		);
	} finally {
		rl.close();
	}
};

export const runCli = async (argv: string[]): Promise<void> => {
	const io = createConsoleIO();
	const args = parseInstallerArgs(argv);
	const allExtensions = await discoverExtensions(rootDir);

	if (allExtensions.length === 0) {
		io.log("No extensions found.");
		return;
	}

	let selected = resolveSelectedExtensions(allExtensions, args);
	if (selected.length === 0) {
		if (stdin.isTTY) {
			selected = await promptForExtensions(allExtensions);
		} else {
			selected = [...allExtensions];
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
	io.log("  Auth: uses pi provider auth/env; no extra extension login yet");
	io.log("");
};

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
	await runCli(process.argv.slice(2));
}
