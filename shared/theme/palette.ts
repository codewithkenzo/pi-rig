import type { Palette, SemanticToken } from "./types.js";

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

export const catppuccinMocha: Palette = {
  name: "catppuccin-mocha",
  variant: "dark",
  description: "Catppuccin Mocha — soothing pastel dark theme",
  source: "pi-theme-switcher",
  semantic: semantic(
    "#89b4fa",  // accent
    "#a6e3a1",  // success
    "#f38ba8",  // error
    "#f9e2af",  // warning
    "#6c7086",  // muted
    "#1F2027",  // dim
    "#CCD5F4",  // text
    "#30323F",  // border
    "#f5c2e7",  // highlight
    "#89dceb",  // info
    "#a6e3a1",  // active
    "#6c7086",  // inactive
    "#CAA5F7",  // header
    "#B4BEFE",  // label
    "#CCD5F4",  // value
    "#1B1C26",  // separator
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
    "#6294F8",  // accent
    "#7AD566",  // success
    "#F24A6E",  // error
    "#E8AA53",  // warning
    "#8c8fa1",  // muted
    "#1F2128",  // dim
    "#C9CBD8",  // text
    "#30343F",  // border
    "#ea76cb",  // highlight
    "#5ECFFC",  // info
    "#8FDC7E",  // active
    "#8c8fa1",  // inactive
    "#C6A0F7",  // header
    "#7287fd",  // label
    "#C3C5D4",  // value
    "#1A1E28",  // separator
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
    "#88c0d0",  // accent
    "#a3be8c",  // success
    "#bf616a",  // error
    "#ebcb8b",  // warning
    "#6A7894",  // muted
    "#1D2129",  // dim
    "#ECEEF3",  // text
    "#3b4252",  // border
    "#b48ead",  // highlight
    "#81a1c1",  // info
    "#a3be8c",  // active
    "#6A7894",  // inactive
    "#B4C5D8",  // header
    "#9FB7CF",  // label
    "#D8DEE8",  // value
    "#1B1F26",  // separator
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
    "#bd93f9",  // accent
    "#50fa7b",  // success
    "#ff5555",  // error
    "#f1fa8c",  // warning
    "#6272a4",  // muted
    "#1E2028",  // dim
    "#F7F7F2",  // text
    "#30323F",  // border
    "#ff79c6",  // highlight
    "#8be9fd",  // info
    "#50fa7b",  // active
    "#6272a4",  // inactive
    "#BE94F9",  // header
    "#8AE9FD",  // label
    "#F7F7F2",  // value
    "#1C1D26",  // separator
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
    "#7aa2f7",  // accent
    "#9ece6a",  // success
    "#f7768e",  // error
    "#e0af68",  // warning
    "#565f89",  // muted
    "#1B1E2B",  // dim
    "#C0CAF5",  // text
    "#2B2F45",  // border
    "#bb9af7",  // highlight
    "#7dcfff",  // info
    "#9ece6a",  // active
    "#565f89",  // inactive
    "#BA99F7",  // header
    "#7DCEFF",  // label
    "#C0CAF5",  // value
    "#1a1b26",  // separator
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
    "#92C5C8",  // accent
    "#DBDE5D",  // success
    "#E65B55",  // error
    "#E5B456",  // warning
    "#928374",  // muted
    "#262221",  // dim
    "#ECDCB6",  // text
    "#3c3836",  // border
    "#C891AA",  // highlight
    "#9CBE9D",  // info
    "#E1E377",  // active
    "#928374",  // inactive
    "#FCDC91",  // header
    "#ACC2BA",  // label
    "#EBDBB2",  // value
    "#282828",  // separator
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
    "#61afef",  // accent
    "#98c379",  // success
    "#e06c75",  // error
    "#e5c07b",  // warning
    "#727B8C",  // muted
    "#1E2128",  // dim
    "#CACFD7",  // text
    "#30343F",  // border
    "#c678dd",  // highlight
    "#87CBD3",  // info
    "#98c379",  // active
    "#727B8C",  // inactive
    "#D9A5E8",  // header
    "#96D1D9",  // label
    "#BFC4CE",  // value
    "#21252b",  // separator
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
    "#74B7E5",  // accent
    "#E5FF3D",  // success
    "#E35B59",  // error
    "#FFCF3D",  // warning
    "#657b83",  // muted
    "#1E2628",  // dim
    "#CDD4D4",  // text
    "#073642",  // border
    "#E179AB",  // highlight
    "#7DDDD5",  // info
    "#E9FF5B",  // active
    "#657b83",  // inactive
    "#AEB1DE",  // header
    "#8DE1DB",  // label
    "#C2CACB",  // value
    "#002b36",  // separator
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
    "#74B7E5",  // accent
    "#E5FF3D",  // success
    "#E35B59",  // error
    "#FFCF3D",  // warning
    "#93a1a1",  // muted
    "#322B14",  // dim
    "#CAD4D7",  // text
    "#4F4420",  // border
    "#E179AB",  // highlight
    "#7DDDD5",  // info
    "#E9FF5B",  // active
    "#93a1a1",  // inactive
    "#B6B8E1",  // header
    "#8DE1DB",  // label
    "#C5CFD2",  // value
    "#3D2E04",  // separator
  ),
  raw: { ...solarizedDark.raw },
  animations: defaultAnimations,
};

export const kenzoElectricMidnight: Palette = {
  name: "electric-midnight",
  variant: "dark",
  description: "Electric Midnight — dark chrome with electric purple/blue accents, by Kenzo.",
  source: "pi-theme-switcher",
  semantic: semantic(
    "#8B5CF6",  // accent
    "#3B82F6",  // success
    "#E45858",  // error
    "#8B5CF6",  // warning
    "#A1A1AA",  // muted
    "#212125",  // dim
    "#E4E4E7",  // text
    "#27272A",  // border
    "#629BF7",  // highlight
    "#629BF7",  // info
    "#8B5CF6",  // active
    "#787886",  // inactive
    "#E4E4E7",  // header
    "#B4B4BB",  // label
    "#E4E4E7",  // value
    "#141414",  // separator
  ),
  raw: {
    bgDeep: "#0A0A0A",
    bgSurface: "#141414",
    bgOverlay: "#18181B",
    accentPrimary: "#8B5CF6",
    accentSecondary: "#3B82F6",
    highlight: "#DC2626",
    chromeHigh: "#E4E4E7",
    chromeMid: "#A1A1AA",
    chromeLow: "#52525B",
    chromeDark: "#27272A",
  },
  animations: {
    runningFrames: ["", "", "", ""],
    toolFrames: ["▏", "▎", "▍", "▌", "▋", "▊"],
    streamingFrames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
    doneSymbol: "",
    failedSymbol: "",
    cancelledSymbol: "⊘",
    pendingSymbol: "",
    spinnerInterval: 0.14,
  },
};


export const hermesCadet: Palette = {
  name: "cadet",
  variant: "dark",
  description: "Cadet — black, violet, lime, and soft-white palette (Hermes skin)",
  source: "hermes",
  semantic: semantic(
    "#9D6AF0",  // accent
    "#C6FF33",  // success
    "#FF6B6B",  // error
    "#C6FF33",  // warning
    "#681EFF",  // muted
    "#201B2B",  // dim
    "#F5F4ED",  // text
    "#2D0A65",  // border
    "#C6FF33",  // highlight
    "#B794FF",  // info
    "#C6FF33",  // active
    "#681EFF",  // inactive
    "#F5F4ED",  // header
    "#F5F4ED",  // label
    "#F5F4ED",  // value
    "#1A063C",  // separator
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
    "#202427",  // dim
    "#DFD6C2",  // text
    "#323A3D",  // border
    "#7FBBB3",  // highlight
    "#A7C080",  // info
    "#A7C080",  // active
    "#859289",  // inactive
    "#CBD9B4",  // header
    "#BCCF9F",  // label
    "#D8CDB5",  // value
    "#1D2224",  // separator
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
    "#8CCCCE",  // accent
    "#90B883",  // success
    "#D79D64",  // error
    "#DAB661",  // warning
    "#6E7B8A",  // muted
    "#1B222C",  // dim
    "#DDD8C4",  // text
    "#2E3B4B",  // border
    "#86CBD3",  // highlight
    "#86CBD3",  // info
    "#A2C397",  // active
    "#6E7B8A",  // inactive
    "#ACDBE1",  // header
    "#95D1D9",  // label
    "#D7D1B9",  // value
    "#192029",  // separator
  ),
  raw: {
    background: "#111820",
    teal: "#3B8A8C",
    cyan: "#5BB8C4",
    green: "#6B9E5A",
    parchment: "#D7D1B9",
  },
  animations: { ...defaultAnimations },
};

export const hermesKanso: Palette = {
  name: "kanso",
  variant: "dark",
  description: "Kansō Zen — deep dark with muted earth tones (Hermes skin)",
  source: "hermes",
  semantic: semantic(
    "#A1A8B9",  // accent
    "#98BB6C",  // success
    "#D06B6D",  // error
    "#DCA561",  // warning
    "#787E86",  // muted
    "#202126",  // dim
    "#CFD2D1",  // text
    "#393B44",  // border
    "#A1A8B9",  // highlight
    "#8ea4a2",  // info
    "#B0CB8F",  // active
    "#787E86",  // inactive
    "#C5C9C7",  // header
    "#AFBFBD",  // label
    "#BCCAD1",  // value
    "#1E1F24",  // separator
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
    "#81A1C1",  // accent
    "#A3BE8C",  // success
    "#E8A4CC",  // error
    "#DFCA9A",  // warning
    "#6A7894",  // muted
    "#1D2129",  // dim
    "#E5E9F0",  // text
    "#3B4252",  // border
    "#C89BD0",  // highlight
    "#C89BD0",  // info
    "#A3BE8C",  // active
    "#6A7894",  // inactive
    "#B3C6D9",  // header
    "#C99DD1",  // label
    "#E5E9F0",  // value
    "#1B1F26",  // separator
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
    "#8E82B0",  // accent
    "#6DAEC4",  // success
    "#C47088",  // error
    "#9E8CC0",  // warning
    "#7882A0",  // muted
    "#1D2029",  // dim
    "#CFCFD2",  // text
    "#383838",  // border
    "#9B8FBF",  // highlight
    "#A8A8A8",  // info
    "#8ABED0",  // active
    "#7882A0",  // inactive
    "#AAD0E2",  // header
    "#B7B7B7",  // label
    "#C8C8CC",  // value
    "#1B1E26",  // separator
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
    "#C4A7E7",  // accent
    "#9CCFD8",  // success
    "#EB6F92",  // error
    "#F6C177",  // warning
    "#6E6A86",  // muted
    "#201E28",  // dim
    "#E0DEF4",  // text
    "#32303F",  // border
    "#C4A7E7",  // highlight
    "#EA9A97",  // info
    "#9CCFD8",  // active
    "#6E6A86",  // inactive
    "#ECA4A1",  // header
    "#EA9A97",  // label
    "#E0DEF4",  // value
    "#1D1C25",  // separator
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
    "#7F7F7F",  // muted
    "#232323",  // dim
    "#E8E8E8",  // text
    "#383838",  // border
    "#D0D0D0",  // highlight
    "#E0E0E0",  // info
    "#B0B0B0",  // active
    "#7F7F7F",  // inactive
    "#F0F0F0",  // header
    "#E0E0E0",  // label
    "#E8E8E8",  // value
    "#212121",  // separator
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
    "#7AA2F7",  // accent
    "#9ECE6A",  // success
    "#F7768E",  // error
    "#E0AF68",  // warning
    "#565F89",  // muted
    "#1B1E2B",  // dim
    "#C0CAF5",  // text
    "#2B2F45",  // border
    "#BB9AF7",  // highlight
    "#7DCFFF",  // info
    "#9ECE6A",  // active
    "#565F89",  // inactive
    "#BA99F7",  // header
    "#7DCEFF",  // label
    "#C0CAF5",  // value
    "#1A1B26",  // separator
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
    "#747C8A",  // muted
    "#202227",  // dim
    "#F0EFEB",  // text
    "#3D424A",  // border
    "#B4BCC4",  // highlight
    "#B4C4BC",  // info
    "#B8C4B8",  // active
    "#747C8A",  // inactive
    "#C0C6CD",  // header
    "#B4C4BC",  // label
    "#F0EFEB",  // value
    "#1D2024",  // separator
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

export const BUILTIN_PALETTES: readonly Palette[] = [
  // Popular
  catppuccinMocha, catppuccinLatte,
  nord, dracula,
  tokyoNight, gruvboxDark, oneDark,
  solarizedDark, solarizedLight, kenzoElectricMidnight,
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

export const fromOverrides = (
  base: Palette,
  overrides: Partial<Record<SemanticToken, string>>,
): Palette => ({
  ...base,
  name: "custom",
  source: "custom",
  semantic: { ...base.semantic, ...overrides },
});
