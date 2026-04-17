const NO_COLOR = process.env.NO_COLOR === "1";
const USE_ASCII =
	process.env.PI_ASCII_ICONS === "1" || process.env.TERM === "dumb";

export const fg = (hex: string, text: string): string => {
	if (NO_COLOR) return text;
	const h = hex.startsWith("#") ? hex.slice(1) : hex;
	if (h.length !== 6) return text;
	const r = Number.parseInt(h.slice(0, 2), 16);
	const g = Number.parseInt(h.slice(2, 4), 16);
	const b = Number.parseInt(h.slice(4, 6), 16);
	return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
};

const bold = (text: string): string =>
	NO_COLOR ? text : `\x1b[1m${text}\x1b[22m`;

export interface CliTokens {
	accent: (text: string) => string;
	accentDim: (text: string) => string;
	secondary: (text: string) => string;
	text: (text: string) => string;
	muted: (text: string) => string;
	dim: (text: string) => string;
	subtle: (text: string) => string;
	success: (text: string) => string;
	warning: (text: string) => string;
	error: (text: string) => string;
	bold: (text: string) => string;
}

export const tokens: CliTokens = {
	accent: (t) => fg("#8B5CF6", t),
	accentDim: (t) => fg("#7C3AED", t),
	secondary: (t) => fg("#3B82F6", t),
	text: (t) => fg("#E4E4E7", t),
	muted: (t) => fg("#A1A1AA", t),
	dim: (t) => fg("#52525B", t),
	subtle: (t) => fg("#27272A", t),
	success: (t) => fg("#22C55E", t),
	warning: (t) => fg("#F59E0B", t),
	error: (t) => fg("#DC2626", t),
	bold,
};

export interface CliIcons {
	app: string;
	step: string;
	ok: string;
	warn: string;
	error: string;
	info: string;
	pkg: string;
	pi: string;
	dot: string;
	wait: string;
	auth: string;
	bullet: string;
	bulletDim: string;
}

export const icons: CliIcons = USE_ASCII
	? {
			app: "[pi-rig]",
			step: "->",
			ok: "[ok]",
			warn: "[!]",
			error: "[x]",
			info: "[i]",
			pkg: "[pkg]",
			pi: "[pi]",
			dot: "-",
			wait: "[..]",
			auth: "[auth]",
			bullet: "*",
			bulletDim: "-",
		}
	: {
			app: "⚡",
			step: "➜",
			ok: "✓",
			warn: "⚠",
			error: "✗",
			info: "ℹ",
			pkg: "󰏗",
			pi: "π",
			dot: "·",
			wait: "⏳",
			auth: "🔐",
			bullet: "●",
			bulletDim: "○",
		};

export const isTTY = process.stdin.isTTY === true;
