export interface InstallerArgs {
	all: boolean;
	extensions: string[] | null;
	piPath: string | null;
	dryRun: boolean;
	skipInstall: boolean;
	installSkills: boolean;
}

export const defaultInstallerArgs = (): InstallerArgs => ({
	all: false,
	extensions: null,
	piPath: null,
	dryRun: false,
	skipInstall: false,
	installSkills: true,
});

export const parseInstallerArgs = (argv: string[]): InstallerArgs => {
	const parsed = defaultInstallerArgs();

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--all") {
			parsed.all = true;
			continue;
		}
		if (arg === "--dry-run") {
			parsed.dryRun = true;
			continue;
		}
		if (arg === "--skip-install") {
			parsed.skipInstall = true;
			continue;
		}
		if (arg === "--skills") {
			parsed.installSkills = true;
			continue;
		}
		if (arg === "--no-skills") {
			parsed.installSkills = false;
			continue;
		}
		if (arg === "--extensions") {
			const value = argv[index + 1];
			if (value !== undefined) {
				parsed.extensions = value
					.split(",")
					.map((part) => part.trim())
					.filter((part) => part.length > 0);
				index += 1;
			}
			continue;
		}
		if (arg === "--pi-path") {
			const value = argv[index + 1];
			if (value !== undefined) {
				parsed.piPath = value;
				index += 1;
			}
		}
	}

	return parsed;
};

export const resolveSelectedExtensions = (
	allExtensions: readonly string[],
	args: InstallerArgs,
): string[] => {
	if (args.extensions !== null) {
		return allExtensions.filter((name) => args.extensions?.includes(name) === true);
	}

	if (args.all) {
		return [...allExtensions];
	}

	return [];
};
