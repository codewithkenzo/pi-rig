import pc from "picocolors";
import { linearGradient } from "./gradient.js";
import type { Palette, SemanticToken, ColorMode } from "./types.js";

export interface ThemeEngine {
  /** Apply a semantic foreground color to text */
  fg(token: SemanticToken, text: string): string;
  /** Apply a semantic background color to text */
  bg(token: SemanticToken, text: string): string;
  bold(text: string): string;
  dim(text: string): string;
  italic(text: string): string;
  underline(text: string): string;
  /** Linear truecolor gradient across text */
  gradient(text: string, fromHex: string, toHex: string): string;
  /** Raw hex color — escape hatch for one-offs */
  raw(hex: string, text: string): string;
  /** Raw hex background */
  rawBg(hex: string, text: string): string;
  /** Strip all ANSI codes */
  strip(text: string): string;
  /** The underlying palette */
  readonly palette: Palette;
  readonly mode: ColorMode;
}

export const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const num = parseInt(h, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
};

const truecolorFg = (hex: string, text: string): string => {
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
};

const truecolorBg = (hex: string, text: string): string => {
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[48;2;${r};${g};${b}m${text}\x1b[0m`;
};

const ANSI_STRIP_RE = /\x1b\[[0-9;]*m/g;
const stripAnsi = (text: string): string => text.replace(ANSI_STRIP_RE, "");

const hex256 = (hex: string, text: string): string => {
  const [r, g, b] = hexToRgb(hex);
  const idx =
    16 +
    36 * Math.round((r / 255) * 5) +
    6 * Math.round((g / 255) * 5) +
    Math.round((b / 255) * 5);
  return `\x1b[38;5;${idx}m${text}\x1b[0m`;
};

const engineCache = new Map<string, ThemeEngine>();

const buildEngine = (palette: Palette, mode: ColorMode): ThemeEngine => {
  const resolve = (token: SemanticToken): string => palette.semantic[token];

  const applyFg = (hex: string, text: string): string => {
    if (mode === "none") return text;
    if (mode === "truecolor") return truecolorFg(hex, text);
    if (mode === "256") return hex256(hex, text);
    return text;
  };

  const applyBg = (hex: string, text: string): string => {
    if (mode === "none") return text;
    if (mode === "truecolor") return truecolorBg(hex, text);
    return text;
  };

  return {
    palette,
    mode,
    fg: (token, text) => applyFg(resolve(token), text),
    bg: (token, text) => applyBg(resolve(token), text),
    bold: (text) => pc.bold(text),
    dim: (text) => pc.dim(text),
    italic: (text) => pc.italic(text),
    underline: (text) => pc.underline(text),
    gradient: (text, from, to) =>
      mode === "none" ? text : linearGradient(text, from, to),
    raw: (hex, text) => applyFg(hex, text),
    rawBg: (hex, text) => applyBg(hex, text),
    strip: stripAnsi,
  };
};

export const createEngine = (palette: Palette, mode: ColorMode): ThemeEngine => {
  if (palette.name === "custom") return buildEngine(palette, mode);
  const key = `${palette.name}:${mode}`;
  const cached = engineCache.get(key);
  if (cached !== undefined) return cached;
  const engine = buildEngine(palette, mode);
  engineCache.set(key, engine);
  return engine;
};
