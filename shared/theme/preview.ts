import { createEngine } from "./engine.js";
import { linearGradient, rainbowGradient } from "./gradient.js";
import { BUILTIN_PALETTES, PALETTE_MAP } from "./palette.js";
import type { Palette, SemanticToken } from "./types.js";

const TOKENS: SemanticToken[] = [
  "accent", "success", "error", "warning",
  "muted", "dim", "text", "border",
  "highlight", "info", "active", "inactive",
  "header", "label", "value", "separator",
];

// Section label: ── Title ───────────────────
const sectionLabel = (title: string, width: number, dimFn: (s: string) => string): string => {
  const inner = ` ${title} `;
  const remaining = Math.max(0, width - inner.length - 2);
  const left = Math.floor(remaining / 2);
  const right = remaining - left;
  return dimFn(`${"─".repeat(left)}${inner}${"─".repeat(right)}`);
};

/**
 * Renders a full palette preview as an array of lines.
 * Pass `width` to control line length (default 62).
 */
export const renderPalettePreview = (palette: Palette, width = 62): string[] => {
  const engine = createEngine(palette, "truecolor");
  const lines: string[] = [];

  // ── Header ──────────────────────────────────────────────────────────────────
  const badge = palette.source && palette.source !== "builtin"
    ? ` [${palette.source}]`
    : "";
  const label = `  ${palette.name}${badge}  `;
  const halfBar = Math.max(2, Math.floor((width - label.length - 2) / 2));
  const leftEdge  = `┌${"━".repeat(halfBar)}`;
  const rightEdge = `${"━".repeat(halfBar)}┐`;
  lines.push(
    linearGradient(leftEdge, palette.semantic.accent, palette.semantic.header) +
    engine.bold(engine.fg("accent", label)) +
    linearGradient(rightEdge, palette.semantic.header, palette.semantic.accent),
  );

  const variantBadge = palette.variant === "dark" ? "◆ dark" : "◇ light";
  const meta = [variantBadge, palette.source ?? "builtin"].join("  ·  ");
  if (palette.description) {
    lines.push(engine.fg("text", `  ${palette.description}`));
  }
  lines.push(engine.fg("dim", `  ${meta}`));
  lines.push("");

  // ── Semantic Tokens ──────────────────────────────────────────────────────────
  lines.push(sectionLabel("Semantic Tokens", width, (s) => engine.fg("dim", s)));
  lines.push("");

  // 2-column grid: ● token-name [swatch] #hexval
  const colW = Math.floor(width / 2);
  for (let i = 0; i < TOKENS.length; i += 2) {
    const left  = TOKENS[i]!;
    const right = TOKENS[i + 1];

    const makeCell = (token: SemanticToken): string => {
      const hex = palette.semantic[token];
      const swatch = engine.rawBg(hex, "  ");
      const name   = engine.fg(token, `● ${token.padEnd(11)}`);
      const value  = engine.fg("dim", hex);
      return `  ${name} ${swatch} ${value}`;
    };

    const leftCell  = makeCell(left);
    const rightCell = right ? makeCell(right) : "";

    // pad left cell to colW visible chars (ANSI-aware: strip for pad calculation)
    const leftVisible  = engine.strip(leftCell).length;
    const pad = Math.max(0, colW - leftVisible);
    lines.push(leftCell + " ".repeat(pad) + rightCell);
  }
  lines.push("");

  // ── Gradients ────────────────────────────────────────────────────────────────
  lines.push(sectionLabel("Gradients", width, (s) => engine.fg("dim", s)));
  const fill = "█".repeat(width - 2);
  lines.push(" " + linearGradient(fill, palette.semantic.accent, palette.semantic.error));
  lines.push(" " + linearGradient(fill, palette.semantic.success, palette.semantic.warning));
  lines.push(" " + rainbowGradient(fill));
  lines.push("");

  // ── Animation ────────────────────────────────────────────────────────────────
  lines.push(sectionLabel("Animation", width, (s) => engine.fg("dim", s)));
  if (palette.animations) {
    const { runningFrames, toolFrames, doneSymbol, failedSymbol, cancelledSymbol, pendingSymbol, spinnerInterval } = palette.animations;
    const renderFrames = (frames: string[], colorToken: SemanticToken) =>
      frames.map((f) => engine.fg(colorToken, f)).join(engine.fg("dim", " "));

    lines.push(
      engine.fg("dim", "  running   ") + renderFrames(runningFrames, "accent") +
      engine.fg("dim", `  (${spinnerInterval}ms)`),
    );
    if (toolFrames.length > 0) {
      lines.push(engine.fg("dim", "  tool      ") + renderFrames(toolFrames, "info"));
    }
    lines.push(
      "  " +
      engine.fg("success", doneSymbol)    + engine.fg("dim", " done    ") +
      engine.fg("error",   failedSymbol)  + engine.fg("dim", " failed  ") +
      engine.fg("muted",   cancelledSymbol) + engine.fg("dim", " cancelled  ") +
      engine.fg("warning", pendingSymbol) + engine.fg("dim", " pending"),
    );
  } else {
    lines.push(engine.fg("dim", "  pulse  breathe  shimmer  fadeIn  spin"));
  }
  lines.push("");

  // ── Footer ───────────────────────────────────────────────────────────────────
  lines.push(
    linearGradient(`└${"─".repeat(width - 2)}┘`, palette.semantic.accent, palette.semantic.border),
  );

  return lines;
};

/** Renders a compact one-line entry for the /theme list command */
export const renderPaletteEntry = (palette: Palette, active: boolean): string => {
  const engine = createEngine(palette, "truecolor");

  // 5-swatch strip using bg blocks
  const swatchHexes = [
    palette.semantic.accent,
    palette.semantic.success,
    palette.semantic.error,
    palette.semantic.warning,
    palette.semantic.highlight,
  ];
  const swatches = swatchHexes.map((hex) => engine.rawBg(hex, " ")).join("");

  const marker = active ? engine.fg("success", "●") : engine.fg("dim", "○");
  const name   = active
    ? engine.bold(engine.fg("accent", palette.name.padEnd(22)))
    : engine.fg("text", palette.name.padEnd(22));
  const variantStr = engine.fg("dim", palette.variant.padEnd(6));

  return `${marker} ${name} ${swatches}  ${variantStr}`;
};

/** Full list view for /theme list */
export const renderPaletteList = (activeTheme: string): string[] => {
  const lines: string[] = [];
  const engine = createEngine(PALETTE_MAP.get(activeTheme) ?? PALETTE_MAP.values().next().value!, "truecolor");

  // Header
  const title = "  Themes ";
  const barLen = Math.max(0, 60 - title.length - 2);
  lines.push(
    engine.bold(engine.fg("header", title)) +
    engine.fg("dim", "─".repeat(barLen)),
  );
  lines.push("");

  // Group by source
  const groups = new Map<string, Palette[]>();
  for (const p of BUILTIN_PALETTES) {
    const src = p.source ?? "builtin";
    if (!groups.has(src)) groups.set(src, []);
    groups.get(src)!.push(p);
  }

  for (const [src, palettes] of groups) {
    lines.push(engine.fg("label", `  ${src}`));
    for (const p of palettes) {
      lines.push("  " + renderPaletteEntry(p, p.name === activeTheme));
    }
    lines.push("");
  }

  lines.push(engine.fg("dim", "  /theme set <name>   /theme preview <name>"));
  return lines;
};
