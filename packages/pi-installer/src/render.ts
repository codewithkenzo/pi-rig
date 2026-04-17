import { tokens, icons, isTTY } from "./tokens.js";
import type { ExtensionCatalogEntry, InstallerResult } from "./lib.js";

const VERSION = "0.1.2";

const pad = (str: string, len: number): string => {
	const visible = str.replace(/\x1b\[[0-9;]*m/g, "");
	return str + " ".repeat(Math.max(0, len - visible.length));
};

export const renderHeader = (): string[] => {
	if (!isTTY) {
		return [`@codewithkenzo/pi-rig v${VERSION}`];
	}

	const title = `${tokens.bold(tokens.accent(`${icons.app} @codewithkenzo/pi-rig`))}  ${tokens.muted(`v${VERSION}`)}`;
	const subtitle = tokens.muted("Pi extensions installer");
	const line = tokens.dim("─".repeat(42));

	return [
		"",
		`  ${tokens.dim("╭")}${line}${tokens.dim("╮")}`,
		`  ${tokens.dim("│")}  ${pad(title, 40)}${tokens.dim("│")}`,
		`  ${tokens.dim("│")}  ${pad(subtitle, 40)}${tokens.dim("│")}`,
		`  ${tokens.dim("╰")}${line}${tokens.dim("╯")}`,
		"",
	];
};

export const renderExtensionList = (
	available: readonly ExtensionCatalogEntry[],
	comingSoon: readonly ExtensionCatalogEntry[],
): string[] => {
	if (!isTTY) {
		const ids = available.map((e) => e.id).join(", ");
		return [`Available: ${ids}`];
	}

	const lines: string[] = [];
	const allLabels = [...available, ...comingSoon].map((e) => e.label.length);
	const labelWidth = (allLabels.length > 0 ? Math.max(...allLabels) : 16) + 2;

	lines.push(`  ${tokens.dim("┌")} ${tokens.text("Select plugins")}`);
	lines.push(`  ${tokens.dim("│")}`);

	available.forEach((e, i) => {
		const num = tokens.accent(`${i + 1}`);
		const bullet = tokens.success(icons.bullet);
		const label = tokens.bold(tokens.text(e.label));
		const desc = tokens.muted(e.description);
		lines.push(`  ${tokens.dim("│")}  ${num}  ${bullet} ${pad(label, labelWidth)}${desc}`);
	});

	for (const e of comingSoon) {
		const bullet = tokens.dim(icons.bulletDim);
		const label = tokens.dim(e.label);
		const desc = tokens.dim("(coming soon)");
		lines.push(`  ${tokens.dim("│")}  ${tokens.dim("-")}  ${bullet} ${pad(label, labelWidth)}${desc}`);
	}

	lines.push(`  ${tokens.dim("│")}`);
	lines.push(`  ${tokens.dim("│")}  ${tokens.accent("a")}  install all`);
	lines.push(`  ${tokens.dim("│")}`);

	return lines;
};

export const renderSelectorPrompt = (): string => {
	if (!isTTY) return "";
	return `  ${tokens.dim("└")} ${tokens.text("Enter selection (numbers or 'a'):")} `;
};

export const renderAutoSelect = (ids: readonly string[]): string[] => {
	return [`Auto-selecting all (${ids.length} plugins, non-interactive).`];
};

export const renderResults = (result: InstallerResult): string[] => {
	const ready = result.results.filter((e) => e.ready).length;
	const withSkills = result.results.filter((e) => e.skillInstalled).length;

	if (!isTTY) {
		const lines = [`Result: ${ready}/${result.results.length} ready, ${withSkills} skills installed`];
		for (const r of result.results) {
			const status = r.ready ? "ready" : "failed";
			const skill = r.skillInstalled ? ", skill installed" : "";
			lines.push(`  ${r.name}: ${status}${skill}`);
		}
		if (result.piPath !== null) {
			lines.push(`pi: ${result.piPath}`);
		}
		return lines;
	}

	const lines: string[] = [];
	lines.push("");
	lines.push(`  ${tokens.dim("┌")} ${tokens.text("Install complete")}`);
	lines.push(`  ${tokens.dim("│")}`);

	const nameLengths = result.results.map((r) => r.name.length);
	const labelWidth = (nameLengths.length > 0 ? Math.max(...nameLengths) : 16) + 4;

	for (const r of result.results) {
		const icon = r.ready ? tokens.success(icons.ok) : tokens.error(icons.error);
		const label = tokens.bold(tokens.text(r.name));
		const status = r.ready ? tokens.success("ready") : tokens.error("failed");
		const skill = r.skillInstalled ? tokens.muted("skill installed") : "";
		lines.push(`  ${tokens.dim("│")}  ${icon} ${pad(label, labelWidth)}${status}    ${skill}`);
	}

	lines.push(`  ${tokens.dim("│")}`);
	lines.push(`  ${tokens.dim("│")}  ${tokens.text(`${ready}/${result.results.length} ready`)} ${tokens.dim("·")} ${tokens.text(`${withSkills} skills installed`)}`);

	if (result.piPath !== null) {
		lines.push(`  ${tokens.dim("│")}  ${icons.pi} ${tokens.muted(result.piPath)}`);
	}
	lines.push(`  ${tokens.dim("│")}  ${icons.auth} ${tokens.muted("uses existing Pi provider auth")}`);
	lines.push(`  ${tokens.dim("│")}`);
	lines.push(`  ${tokens.dim("└──")}`);
	lines.push("");

	return lines;
};
