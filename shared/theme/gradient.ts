import { hexToRgb } from "./engine.js";

const truecolorChar = (r: number, g: number, b: number, ch: string): string =>
  `\x1b[38;2;${r};${g};${b}m${ch}`;

const lerp = (a: number, b: number, t: number): number =>
  Math.round(a + (b - a) * t);

/**
 * Linear truecolor gradient across every character in `text`.
 * from/to are hex strings (#rrggbb).
 */
export const linearGradient = (text: string, fromHex: string, toHex: string): string => {
  const from = hexToRgb(fromHex);
  const to   = hexToRgb(toHex);
  const len  = text.length;
  if (len === 0) return "";

  let result = "";
  for (let i = 0; i < len; i++) {
    const t = len === 1 ? 0 : i / (len - 1);
    result += truecolorChar(
      lerp(from[0], to[0], t),
      lerp(from[1], to[1], t),
      lerp(from[2], to[2], t),
      text[i] ?? "",
    );
  }
  return result + "\x1b[0m";
};

/**
 * Rainbow gradient — cycles hue across the text.
 */
export const rainbowGradient = (text: string, saturation = 0.75, lightness = 0.6): string => {
  const len = text.length;
  if (len === 0) return "";

  let result = "";
  for (let i = 0; i < len; i++) {
    const hue = (i / len) * 360;
    const [r, g, b] = hslToRgb(hue, saturation, lightness);
    result += truecolorChar(r, g, b, text[i] ?? "");
  }
  return result + "\x1b[0m";
};

/**
 * Multi-stop gradient — `stops` is an array of hex colors.
 * The gradient interpolates through each stop evenly.
 */
export const multiGradient = (text: string, stops: string[]): string => {
  if (stops.length === 0) return text;
  if (stops.length === 1) return linearGradient(text, stops[0]!, stops[0]!);

  const len = text.length;
  if (len === 0) return "";

  const rgbStops = stops.map(hexToRgb);
  const segments = stops.length - 1;

  let result = "";
  for (let i = 0; i < len; i++) {
    const t = len === 1 ? 0 : i / (len - 1);
    const seg = Math.min(Math.floor(t * segments), segments - 1);
    const segT = t * segments - seg;
    const from = rgbStops[seg]!;
    const to   = rgbStops[seg + 1]!;
    result += truecolorChar(
      lerp(from[0], to[0], segT),
      lerp(from[1], to[1], segT),
      lerp(from[2], to[2], segT),
      text[i] ?? "",
    );
  }
  return result + "\x1b[0m";
};

// ─── HSL → RGB ───────────────────────────────────────────────────────────────

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
};
