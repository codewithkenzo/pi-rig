const useNerdFont = (): boolean => process.env["PI_ASCII_ICONS"] !== "1";

const NERD = {
	agent:   "\uf82a",   // nf-md-robot
	tools:   "\udb84\udc0b",   // nf-md-tools (󱐋)
	profile: "\udb80\ude75",   // nf-md-account-circle (󰙵)
	effort:  "\udb80\udfac",   // nf-md-gauge (󰏬)
	model:   "\udb83\udc51",   // nf-md-robot-industrial (󰧑)
} as const;

const ASCII = {
	agent:   "#",
	tools:   "T",
	profile: "P",
	effort:  "E",
	model:   "M",
} as const;

export type DeckIconKey = keyof typeof NERD;

export const DECK_ICONS: Record<DeckIconKey, string> = useNerdFont() ? NERD : ASCII;

export const STATUS_ICONS = {
	running:   "▶",
	pending:   "○",
	done:      "✓",
	failed:    "✗",
	cancelled: "⊘",
} as const;
