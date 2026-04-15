import type { Palette, SemanticToken } from "./types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const semantic = (
  accent: string, success: string, error: string, warning: string,
  muted: string, dim: string, text: string, border: string,
  highlight: string, info: string, active: string, inactive: string,
  header: string, label: string, value: string, separator: string,
): Record<SemanticToken, string> => ({
  accent, success, error, warning, muted, dim, text, border,
  highlight, info, active, inactive, header, label, value, separator,
});

const defaultAnimations: Palette["animations"] = {
  runningFrames:   ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  toolFrames:      ["▏", "▎", "▍", "▌", "▍", "▎"],
  streamingFrames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  doneSymbol:      "✓",
  failedSymbol:    "✗",
  cancelledSymbol: "⊘",
  pendingSymbol:   "○",
  spinnerInterval: 0.15,
};

// ─── Popular built-in palettes ────────────────────────────────────────────────

export const catppuccinMocha: Palette = {
  name: "catppuccin-mocha",
  variant: "dark",
  description: "Catppuccin Mocha — soothing pastel dark theme",
  source: "pi-theme-switcher",
  semantic: semantic(
    "#89b4fa",  // accent    → blue
    "#a6e3a1",  // success   → green
    "#f38ba8",  // error     → red
    "#f9e2af",  // warning   → yellow
    "#6c7086",  // muted     → overlay0
    "#585b70",  // dim       → surface2
    "#cdd6f4",  // text      → text
    "#45475a",  // border    → surface1
    "#f5c2e7",  // highlight → pink
    "#89dceb",  // info      → sky
    "#a6e3a1",  // active    → green
    "#6c7086",  // inactive  → overlay0
    "#cba6f7",  // header    → mauve
    "#b4befe",  // label     → lavender
    "#cdd6f4",  // value     → text
    "#313244",  // separator → surface0
  ),
  raw: {
    rosewater: "#f5e0dc", flamingo: "#f2cdcd", pink: "#f5c2e7",
    mauve: "#cba6f7", red: "#f38ba8", maroon: "#eba0ac",
    peach: "#fab387", yellow: "#f9e2af", green: "#a6e3a1",
    teal: "#94e2d5", sky: "#89dceb", sapphire: "#74c7ec",
    blue: "#89b4fa", lavender: "#b4befe", text: "#cdd6f4",
    subtext1: "#bac2de", subtext0: "#a6adc8", overlay2: "#9399b2",
    overlay1: "#7f849c", overlay0: "#6c7086", surface2: "#585b70",
    surface1: "#45475a", surface0: "#313244", base: "#1e1e2e",
    mantle: "#181825", crust: "#11111b",
  },
  animations: defaultAnimations,
};

export const catppuccinLatte: Palette = {
  name: "catppuccin-latte",
  variant: "light",
  description: "Catppuccin Latte — soothing pastel light theme",
  source: "pi-theme-switcher",
  semantic: semantic(
    "#1e66f5",  // accent    → blue
    "#40a02b",  // success   → green
    "#d20f39",  // error     → red
    "#df8e1d",  // warning   → yellow
    "#8c8fa1",  // muted     → overlay0
    "#acb0be",  // dim       → surface2
    "#4c4f69",  // text
    "#bcc0cc",  // border    → surface1
    "#ea76cb",  // highlight → pink
    "#04a5e5",  // info      → sky
    "#40a02b",  // active    → green
    "#8c8fa1",  // inactive
    "#8839ef",  // header    → mauve
    "#7287fd",  // label     → lavender
    "#4c4f69",  // value
    "#dce0e8",  // separator → crust
  ),
  raw: {
    rosewater: "#dc8a78", flamingo: "#dd7878", pink: "#ea76cb",
    mauve: "#8839ef", red: "#d20f39", maroon: "#e64553",
    peach: "#fe640b", yellow: "#df8e1d", green: "#40a02b",
    teal: "#179299", sky: "#04a5e5", sapphire: "#209fb5",
    blue: "#1e66f5", lavender: "#7287fd", text: "#4c4f69",
  },
  animations: defaultAnimations,
};

export const nord: Palette = {
  name: "nord",
  variant: "dark",
  description: "Nord — arctic, north-bluish color palette",
  source: "pi-theme-switcher",
  semantic: semantic(
    "#88c0d0",  // accent    → nord8 (frost)
    "#a3be8c",  // success   → nord14 (aurora green)
    "#bf616a",  // error     → nord11 (aurora red)
    "#ebcb8b",  // warning   → nord13 (aurora yellow)
    "#4c566a",  // muted     → nord3
    "#434c5e",  // dim       → nord2
    "#eceff4",  // text      → nord6
    "#3b4252",  // border    → nord1
    "#b48ead",  // highlight → nord15 (aurora purple)
    "#81a1c1",  // info      → nord9 (frost)
    "#a3be8c",  // active    → green
    "#4c566a",  // inactive  → nord3
    "#5e81ac",  // header    → nord10 (frost)
    "#81a1c1",  // label     → nord9
    "#d8dee9",  // value     → nord4
    "#2e3440",  // separator → nord0
  ),
  raw: {
    nord0: "#2e3440", nord1: "#3b4252", nord2: "#434c5e", nord3: "#4c566a",
    nord4: "#d8dee9", nord5: "#e5e9f0", nord6: "#eceff4",
    nord7: "#8fbcbb", nord8: "#88c0d0", nord9: "#81a1c1", nord10: "#5e81ac",
    nord11: "#bf616a", nord12: "#d08770", nord13: "#ebcb8b",
    nord14: "#a3be8c", nord15: "#b48ead",
  },
  animations: defaultAnimations,
};

export const dracula: Palette = {
  name: "dracula",
  variant: "dark",
  description: "Dracula — dark theme for code editors and terminals",
  source: "pi-theme-switcher",
  semantic: semantic(
    "#bd93f9",  // accent    → purple
    "#50fa7b",  // success   → green
    "#ff5555",  // error     → red
    "#f1fa8c",  // warning   → yellow
    "#6272a4",  // muted     → comment
    "#44475a",  // dim       → selection
    "#f8f8f2",  // text      → foreground
    "#44475a",  // border    → selection
    "#ff79c6",  // highlight → pink
    "#8be9fd",  // info      → cyan
    "#50fa7b",  // active    → green
    "#6272a4",  // inactive  → comment
    "#bd93f9",  // header    → purple
    "#8be9fd",  // label     → cyan
    "#f8f8f2",  // value
    "#282a36",  // separator → background
  ),
  raw: {
    background: "#282a36", currentLine: "#44475a", foreground: "#f8f8f2",
    comment: "#6272a4", cyan: "#8be9fd", green: "#50fa7b",
    orange: "#ffb86c", pink: "#ff79c6", purple: "#bd93f9",
    red: "#ff5555", yellow: "#f1fa8c",
  },
  animations: defaultAnimations,
};

export const tokyoNight: Palette = {
  name: "tokyo-night",
  variant: "dark",
  description: "Tokyo Night — a clean dark theme inspired by Tokyo's night",
  source: "pi-theme-switcher",
  semantic: semantic(
    "#7aa2f7",  // accent    → blue
    "#9ece6a",  // success   → green
    "#f7768e",  // error     → red
    "#e0af68",  // warning   → yellow
    "#565f89",  // muted     → comment
    "#414868",  // dim       → terminal_black
    "#c0caf5",  // text      → foreground
    "#414868",  // border
    "#bb9af7",  // highlight → purple
    "#7dcfff",  // info      → cyan
    "#9ece6a",  // active    → green
    "#565f89",  // inactive  → comment
    "#bb9af7",  // header    → purple
    "#7dcfff",  // label     → cyan
    "#c0caf5",  // value
    "#1a1b26",  // separator → background
  ),
  raw: {
    background: "#1a1b26", terminal_black: "#414868",
    foreground: "#c0caf5", comment: "#565f89",
    blue: "#7aa2f7", cyan: "#7dcfff", green: "#9ece6a",
    orange: "#ff9e64", pink: "#f7768e", purple: "#bb9af7",
    red: "#f7768e", yellow: "#e0af68",
  },
  animations: {
    runningFrames:   ["◐", "◓", "◑", "◒"],
    toolFrames:      ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"],
    streamingFrames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
    doneSymbol: "✓", failedSymbol: "✗", cancelledSymbol: "⊘",
    pendingSymbol: "◌", spinnerInterval: 0.15,
  },
};

export const gruvboxDark: Palette = {
  name: "gruvbox-dark",
  variant: "dark",
  description: "Gruvbox Dark — retro groove color scheme",
  source: "pi-theme-switcher",
  semantic: semantic(
    "#458588",  // accent    → aqua
    "#b8bb26",  // success   → green
    "#cc241d",  // error     → red
    "#d79921",  // warning   → yellow
    "#928374",  // muted     → gray
    "#504945",  // dim       → bg3
    "#ebdbb2",  // text      → fg
    "#3c3836",  // border    → bg1
    "#b16286",  // highlight → purple
    "#689d6a",  // info      → aqua-dark
    "#b8bb26",  // active    → green
    "#928374",  // inactive  → gray
    "#fabd2f",  // header    → yellow-bright
    "#83a598",  // label     → blue
    "#ebdbb2",  // value     → fg
    "#282828",  // separator → bg0
  ),
  raw: {
    bg0: "#282828", bg1: "#3c3836", bg2: "#504945", bg3: "#665c54",
    bg4: "#7c6f64", fg: "#ebdbb2", fg1: "#ebdbb2",
    red: "#cc241d", green: "#98971a", yellow: "#d79921", blue: "#458588",
    purple: "#b16286", aqua: "#689d6a", orange: "#d65d0e",
    "bright-red": "#fb4934", "bright-green": "#b8bb26",
    "bright-yellow": "#fabd2f", "bright-blue": "#83a598",
    "bright-purple": "#d3869b", "bright-aqua": "#8ec07c",
    gray: "#928374",
  },
  animations: defaultAnimations,
};

export const oneDark: Palette = {
  name: "one-dark",
  variant: "dark",
  description: "One Dark — Atom's iconic dark theme",
  source: "pi-theme-switcher",
  semantic: semantic(
    "#61afef",  // accent    → blue
    "#98c379",  // success   → green
    "#e06c75",  // error     → red
    "#e5c07b",  // warning   → yellow
    "#5c6370",  // muted     → comment
    "#3e4452",  // dim       → gutter
    "#abb2bf",  // text      → fg
    "#3e4452",  // border
    "#c678dd",  // highlight → purple
    "#56b6c2",  // info      → cyan
    "#98c379",  // active
    "#5c6370",  // inactive
    "#c678dd",  // header    → purple
    "#56b6c2",  // label     → cyan
    "#abb2bf",  // value
    "#21252b",  // separator → bg
  ),
  raw: {
    bg: "#21252b", bg2: "#282c34", fg: "#abb2bf",
    red: "#e06c75", orange: "#d19a66", yellow: "#e5c07b",
    green: "#98c379", cyan: "#56b6c2", blue: "#61afef",
    purple: "#c678dd", comment: "#5c6370",
  },
  animations: defaultAnimations,
};

export const solarizedDark: Palette = {
  name: "solarized-dark",
  variant: "dark",
  description: "Solarized Dark — precision colors for machines and people",
  source: "pi-theme-switcher",
  semantic: semantic(
    "#268bd2",  // accent    → blue
    "#859900",  // success   → green
    "#dc322f",  // error     → red
    "#b58900",  // warning   → yellow
    "#657b83",  // muted     → base01
    "#586e75",  // dim       → base00
    "#839496",  // text      → base0
    "#073642",  // border    → base02
    "#d33682",  // highlight → magenta
    "#2aa198",  // info      → cyan
    "#859900",  // active
    "#657b83",  // inactive
    "#6c71c4",  // header    → violet
    "#2aa198",  // label     → cyan
    "#839496",  // value
    "#002b36",  // separator → base03
  ),
  raw: {
    base03: "#002b36", base02: "#073642", base01: "#586e75",
    base00: "#657b83", base0: "#839496", base1: "#93a1a1",
    base2: "#eee8d5", base3: "#fdf6e3",
    yellow: "#b58900", orange: "#cb4b16", red: "#dc322f",
    magenta: "#d33682", violet: "#6c71c4", blue: "#268bd2",
    cyan: "#2aa198", green: "#859900",
  },
  animations: defaultAnimations,
};

export const solarizedLight: Palette = {
  name: "solarized-light",
  variant: "light",
  description: "Solarized Light — the light variant",
  source: "pi-theme-switcher",
  semantic: semantic(
    "#268bd2", "#859900", "#dc322f", "#b58900",
    "#93a1a1", "#eee8d5", "#586e75", "#eee8d5",
    "#d33682", "#2aa198", "#859900", "#93a1a1",
    "#6c71c4", "#2aa198", "#657b83", "#fdf6e3",
  ),
  raw: { ...solarizedDark.raw },
  animations: defaultAnimations,
};

// ─── Hermes skins ─────────────────────────────────────────────────────────────

// Mapping: hermes color roles → semantic tokens
// ui_accent → accent, ui_ok → success, ui_error → error, ui_warn → warning
// banner_dim → muted, status_bar_text → dim, banner_text → text
// banner_border → border+separator, banner_accent → highlight
// ui_label → info+label, status_bar_good → active, banner_dim → inactive
// banner_title → header, banner_text → value

export const hermesCadet: Palette = {
  name: "cadet",
  variant: "dark",
  description: "Cadet — black, violet, lime, and soft-white palette (Hermes skin)",
  source: "hermes",
  semantic: semantic(
    "#7D39EB",  // accent    → ui_accent (violet)
    "#C6FF33",  // success   → ui_ok (lime)
    "#FF6B6B",  // error     → ui_error
    "#C6FF33",  // warning   → ui_warn (lime)
    "#B794FF",  // muted     → banner_dim
    "#D9D5E4",  // dim       → status_bar_dim
    "#F5F4EE",  // text      → banner_text
    "#7D39EB",  // border    → banner_border (violet)
    "#C6FF33",  // highlight → banner_accent
    "#B794FF",  // info      → banner_dim
    "#C6FF33",  // active    → status_bar_good
    "#B794FF",  // inactive  → banner_dim
    "#F5F4EE",  // header    → banner_title
    "#F5F4EE",  // label     → ui_label
    "#F5F4EE",  // value     → banner_text
    "#7D39EB",  // separator → border
  ),
  raw: { violet: "#7D39EB", lime: "#C6FF33", softwhite: "#F5F4EE", lavender: "#B794FF" },
  animations: {
    runningFrames: ["◇", "◈", "◆", "◈"],
    toolFrames:    ["▏", "▎", "▍", "▌", "▍", "▎"],
    streamingFrames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
    doneSymbol: "◆", failedSymbol: "✗", cancelledSymbol: "⊘",
    pendingSymbol: "◇", spinnerInterval: 0.15,
  },
};

export const hermesGrove: Palette = {
  name: "grove",
  variant: "dark",
  description: "Grove — forest greens and earthy tones (Hermes skin)",
  source: "hermes",
  semantic: semantic(
    "#7FBBB3",  // accent
    "#A7C080",  // success
    "#E67E80",  // error
    "#E69875",  // warning
    "#859289",  // muted
    "#414B50",  // dim
    "#D3C6AA",  // text
    "#414B50",  // border
    "#7FBBB3",  // highlight → banner_accent
    "#A7C080",  // info      → ui_label
    "#A7C080",  // active
    "#859289",  // inactive
    "#A7C080",  // header    → banner_title
    "#A7C080",  // label
    "#D3C6AA",  // value
    "#414B50",  // separator
  ),
  raw: { teal: "#7FBBB3", green: "#A7C080", red: "#E67E80", orange: "#E69875", sand: "#D3C6AA" },
  animations: { ...defaultAnimations },
};

export const hermesHyrule: Palette = {
  name: "hyrule",
  variant: "dark",
  description: "Hyrule — deep teal and parchment, Legend of Zelda inspired (Hermes skin)",
  source: "hermes",
  semantic: semantic(
    "#3B8A8C",  // accent
    "#6B9E5A",  // success
    "#C47A32",  // error
    "#D4A843",  // warning
    "#6E7B8A",  // muted
    "#2E3B4B",  // dim
    "#D7D1B9",  // text
    "#2E3B4B",  // border
    "#5BB8C4",  // highlight → banner_title
    "#5BB8C4",  // info
    "#6B9E5A",  // active
    "#6E7B8A",  // inactive
    "#5BB8C4",  // header
    "#5BB8C4",  // label
    "#D7D1B9",  // value
    "#2E3B4B",  // separator
  ),
  raw: { teal: "#3B8A8C", cyan: "#5BB8C4", green: "#6B9E5A", parchment: "#D7D1B9" },
  animations: { ...defaultAnimations },
};

export const hermesKanso: Palette = {
  name: "kanso",
  variant: "dark",
  description: "Kansō Zen — deep dark with muted earth tones (Hermes skin)",
  source: "hermes",
  semantic: semantic(
    "#8992a7",  // accent    → violet2
    "#98BB6C",  // success   → green
    "#C34043",  // error     → red
    "#DCA561",  // warning   → yellow
    "#5C6066",  // muted     → gray5
    "#393B44",  // dim       → zenBg3
    "#C5C9C7",  // text      → fg
    "#393B44",  // border    → zenBg3
    "#8992a7",  // highlight → accent
    "#8ea4a2",  // info      → aqua
    "#98BB6C",  // active    → green
    "#5C6066",  // inactive  → gray5
    "#C5C9C7",  // header    → fg
    "#8ea4a2",  // label     → aqua
    "#8ba4b0",  // value     → blue3
    "#393B44",  // separator
  ),
  raw: { violet: "#8992a7", green: "#98BB6C", red: "#C34043", aqua: "#8ea4a2", steel: "#8ba4b0" },
  animations: {
    runningFrames: ["∘", "○", "◌", "○"],
    toolFrames:    ["▏", "▎", "▍", "▌", "▍", "▎"],
    streamingFrames: ["⠁", "⠉", "⠙", "⠚", "⠒", "⠂", "⠂", "⠒", "⠚", "⠙"],
    doneSymbol: "∘", failedSymbol: "✗", cancelledSymbol: "⊘",
    pendingSymbol: "◌", spinnerInterval: 0.21,
  },
};

export const hermesOrchid: Palette = {
  name: "orchid",
  variant: "dark",
  description: "Orchid — Nord base with orchid purple accents (Hermes skin)",
  source: "hermes",
  semantic: semantic(
    "#81A1C1",  // accent    → nord frost
    "#A3BE8C",  // success   → nord green
    "#E8A4CC",  // error     → orchid pink
    "#DFCA9A",  // warning   → warm yellow
    "#4C566A",  // muted     → nord3
    "#3B4252",  // dim       → nord1
    "#E5E9F0",  // text      → nord5
    "#3B4252",  // border    → nord1
    "#C89BD0",  // highlight → orchid purple
    "#C89BD0",  // info      → orchid
    "#A3BE8C",  // active
    "#4C566A",  // inactive
    "#81A1C1",  // header    → frost
    "#C89BD0",  // label     → orchid
    "#E5E9F0",  // value
    "#3B4252",  // separator
  ),
  raw: { frost: "#81A1C1", orchid: "#C89BD0", green: "#A3BE8C", pink: "#E8A4CC" },
  animations: { ...defaultAnimations },
};

export const hermesRazr: Palette = {
  name: "razr",
  variant: "dark",
  description: "Razr — chrome silver with purple and blue glints (Hermes skin)",
  source: "hermes",
  semantic: semantic(
    "#8E82B0",  // accent    → soft purple
    "#6DAEC4",  // success   → blue-green
    "#C47088",  // error     → dusty rose
    "#9E8CC0",  // warning   → muted purple
    "#7882A0",  // muted
    "#7882A0",  // dim
    "#C8C8CC",  // text
    "#A8A8A8",  // border
    "#9B8FBF",  // highlight → banner_accent
    "#A8A8A8",  // info      → ui_label
    "#6DAEC4",  // active    → status_bar_good
    "#7882A0",  // inactive
    "#7EB8D4",  // header    → banner_title
    "#A8A8A8",  // label
    "#C8C8CC",  // value
    "#7882A0",  // separator
  ),
  raw: { chrome: "#C8C8CC", purple: "#8E82B0", blue: "#7EB8D4", silver: "#A8A8A8" },
  animations: { ...defaultAnimations },
};

export const hermesSoho: Palette = {
  name: "soho",
  variant: "dark",
  description: "Soho — Rosé Pine inspired, lavender and rose (Hermes skin)",
  source: "hermes",
  semantic: semantic(
    "#C4A7E7",  // accent    → lavender
    "#9CCFD8",  // success   → foam/cyan
    "#EB6F92",  // error     → love/rose
    "#F6C177",  // warning   → gold
    "#6E6A86",  // muted
    "#524F67",  // dim
    "#E0DEF4",  // text
    "#524F67",  // border
    "#C4A7E7",  // highlight → accent
    "#EA9A97",  // info      → banner_title
    "#9CCFD8",  // active    → status_bar_good
    "#6E6A86",  // inactive
    "#EA9A97",  // header    → banner_title
    "#EA9A97",  // label
    "#E0DEF4",  // value
    "#524F67",  // separator
  ),
  raw: { lavender: "#C4A7E7", rose: "#EB6F92", foam: "#9CCFD8", gold: "#F6C177" },
  animations: { ...defaultAnimations },
};

export const hermesSpike: Palette = {
  name: "spike",
  variant: "dark",
  description: "Spike — monochrome silver, terminal minimalism (Hermes skin)",
  source: "hermes",
  semantic: semantic(
    "#D0D0D0",  // accent
    "#B0B0B0",  // success
    "#E0A0A0",  // error
    "#D0C090",  // warning
    "#6A6A6A",  // muted
    "#5A5A5A",  // dim
    "#E8E8E8",  // text
    "#A0A0A0",  // border
    "#D0D0D0",  // highlight
    "#E0E0E0",  // info
    "#B0B0B0",  // active
    "#6A6A6A",  // inactive
    "#F0F0F0",  // header
    "#E0E0E0",  // label
    "#E8E8E8",  // value
    "#5A5A5A",  // separator
  ),
  raw: { light: "#F0F0F0", mid: "#D0D0D0", dark: "#6A6A6A", error: "#E0A0A0" },
  animations: { ...defaultAnimations },
};

export const hermesStorm: Palette = {
  name: "storm",
  variant: "dark",
  description: "Tokyo Storm — deep blue night with violet and cyan accents (Hermes skin)",
  source: "hermes",
  semantic: semantic(
    "#7AA2F7",  // accent    → blue
    "#9ECE6A",  // success
    "#F7768E",  // error
    "#E0AF68",  // warning
    "#565F89",  // muted
    "#414868",  // dim
    "#C0CAF5",  // text
    "#414868",  // border
    "#BB9AF7",  // highlight → purple
    "#7DCFFF",  // info      → cyan
    "#9ECE6A",  // active
    "#565F89",  // inactive
    "#BB9AF7",  // header    → purple
    "#7DCFFF",  // label     → cyan
    "#C0CAF5",  // value
    "#1A1B26",  // separator → bg
  ),
  raw: {
    blue: "#7AA2F7", purple: "#BB9AF7", cyan: "#7DCFFF",
    green: "#9ECE6A", red: "#F7768E", orange: "#FF9E64",
  },
  animations: {
    runningFrames: ["◐", "◓", "◑", "◒"],
    toolFrames:    ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"],
    streamingFrames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
    doneSymbol: "✓", failedSymbol: "✗", cancelledSymbol: "⊘",
    pendingSymbol: "◌", spinnerInterval: 0.15,
  },
};

export const hermesVesper: Palette = {
  name: "vesper",
  variant: "dark",
  description: "Compline — monastic minimalism, muted and contemplative (Hermes skin)",
  source: "hermes",
  semantic: semantic(
    "#B4BCC4",  // accent
    "#B8C4B8",  // success
    "#CDACAC",  // error
    "#D4CCB4",  // warning
    "#515761",  // muted
    "#3D424A",  // dim
    "#F0EFEB",  // text
    "#3D424A",  // border
    "#B4BCC4",  // highlight
    "#B4C4BC",  // info
    "#B8C4B8",  // active
    "#515761",  // inactive
    "#B4BCC4",  // header
    "#B4C4BC",  // label
    "#F0EFEB",  // value
    "#3D424A",  // separator
  ),
  raw: { silver: "#B4BCC4", sage: "#B8C4B8", blush: "#CDACAC", linen: "#F0EFEB" },
  animations: {
    runningFrames:   ["·", "∘", "·", "∘"],
    toolFrames:      ["▏", "▏", "▎", "▎", "▍", "▍"],
    streamingFrames: ["·", "·", "·", "·", "·", "·", "·", "·"],
    doneSymbol: "·", failedSymbol: "✗", cancelledSymbol: "⊘",
    pendingSymbol: "◌", spinnerInterval: 0.22,
  },
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export const BUILTIN_PALETTES: readonly Palette[] = [
  // Popular
  catppuccinMocha, catppuccinLatte,
  nord, dracula,
  tokyoNight, gruvboxDark, oneDark,
  solarizedDark, solarizedLight,
  // Hermes skins
  hermesCadet, hermesGrove, hermesHyrule, hermesKanso,
  hermesOrchid, hermesRazr, hermesSoho, hermesSpike,
  hermesStorm, hermesVesper,
] as const;

export const PALETTE_MAP = new Map<string, Palette>(
  BUILTIN_PALETTES.map((p) => [p.name, p]),
);

export const getPalette = (name: string): Palette => {
  const p = PALETTE_MAP.get(name);
  if (!p) throw new Error(`Unknown palette: "${name}". Available: ${[...PALETTE_MAP.keys()].join(", ")}`);
  return p;
};

/** Override specific semantic tokens on top of a base palette. */
export const fromOverrides = (
  base: Palette,
  overrides: Partial<Record<SemanticToken, string>>,
): Palette => ({
  ...base,
  name: "custom",
  source: "custom",
  semantic: { ...base.semantic, ...overrides },
});
