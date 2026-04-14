import { hexToRgb } from "./engine.js";

// ─── State ────────────────────────────────────────────────────────────────────

export interface AnimationState {
  /** Monotonically incrementing frame counter */
  frame: number;
  /** Timestamp when the animation started (Date.now()) */
  startedAt: number;
}

const now = (): number => Date.now();

// ─── Primitives ───────────────────────────────────────────────────────────────

/**
 * Pulse — text brightness oscillates (sinusoidal).
 * Returns the colored text string for the current frame.
 */
export const pulse = (
  text: string,
  baseHex: string,
  state: AnimationState,
  fps = 8,
): string => {
  const phase = ((now() - state.startedAt) / 1000) * fps;
  const brightness = 0.55 + 0.45 * Math.sin(phase * Math.PI * 2 / fps);
  const [r, g, b] = hexToRgb(baseHex).map((c) => Math.round(c * brightness)) as [number, number, number];
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
};

/** Breathe — same as pulse but slower (good for ambient indicators) */
export const breathe = (text: string, hex: string, state: AnimationState): string =>
  pulse(text, hex, state, 1.5);

/**
 * Fade-in — characters appear left-to-right over `durationMs` ms.
 */
export const fadeIn = (
  text: string,
  state: AnimationState,
  durationMs = 600,
): string => {
  const elapsed = now() - state.startedAt;
  const t = Math.min(1, elapsed / durationMs);
  const visible = Math.round(text.length * t);
  return text.slice(0, visible) + " ".repeat(text.length - visible);
};

/**
 * Shimmer — a highlight sweep passes over the text (loading indicator).
 */
export const shimmer = (
  text: string,
  baseHex: string,
  highlightHex: string,
  state: AnimationState,
  sweepWidthChars = 4,
): string => {
  const sweepPeriodMs = (text.length + sweepWidthChars * 2) * 60;
  const pos =
    ((((now() - state.startedAt) % sweepPeriodMs) / sweepPeriodMs) *
      (text.length + sweepWidthChars * 2)) -
    sweepWidthChars;

  const [br, bg, bb] = hexToRgb(baseHex);
  const [hr, hg, hb] = hexToRgb(highlightHex);

  let result = "";
  for (let i = 0; i < text.length; i++) {
    const dist = Math.abs(i - pos);
    const t = Math.max(0, 1 - dist / sweepWidthChars);
    const r = Math.round(br + (hr - br) * t);
    const g = Math.round(bg + (hg - bg) * t);
    const b = Math.round(bb + (hb - bb) * t);
    result += `\x1b[38;2;${r};${g};${b}m${text[i] ?? ""}`;
  }
  return result + "\x1b[0m";
};

/**
 * Spin — picks a frame from a spinner set based on elapsed time.
 */
export const spin = (
  frames: readonly string[],
  state: AnimationState,
  fps = 10,
): string => {
  const idx = Math.floor(((now() - state.startedAt) / 1000) * fps) % frames.length;
  return frames[idx] ?? frames[0] ?? "·";
};

// ─── Spinner presets ──────────────────────────────────────────────────────────
//
// Designed in /tmp/spinners.html — 20 styles, categorised:
//   character: terminal-safe frame arrays
//   css-inspired: character approximations of CSS geometric animations
//   skin-matched: frame sets that ship with specific hermes skin palettes

export const spinnerFrames = {
  // ── Character spinners (terminal-safe) ───────────────────────────────────
  /** Classic braille dots — default for most contexts */
  dots:        ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const,
  /** Braille bounce — left-to-right sweep */
  bounce:      ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"] as const,
  /** Braille breathe — slower, smoother */
  braille:     ["⠋", "⠙", "⠚", "⠒", "⠂", "⠂", "⠒", "⠲", "⠴", "⠦"] as const,
  /** Arc — rotating quarter circle */
  arc:         ["◜", "◠", "◝", "◞", "◡", "◟"] as const,
  /** Halves — half-circle rotation (Tokyo Storm / orbit style) */
  halves:      ["◐", "◓", "◑", "◒"] as const,
  /** Block bar — growing/shrinking fill */
  blocks:      ["▏", "▎", "▍", "▌", "▍", "▎"] as const,
  /** ASCII fallback */
  line:        ["-", "\\", "|", "/"] as const,

  // ── Skin-matched presets ─────────────────────────────────────────────────
  /** Zen circles — matches kanso skin (∘ ○ ◌) */
  zen:         ["∘", "○", "◌", "○"] as const,
  /** Whisper — matches vesper skin (monastic minimalism) */
  vesper:      ["·", "·", "∘", "∘"] as const,
  /** Square pulse — matches cadet skin (◇ ◈ ◆) */
  square:      ["◇", "◈", "◆", "◈"] as const,
  /** Dot breathe — minimal single dot */
  dot:         ["·", "∘", "·", "∘"] as const,

  // ── Status morphing ──────────────────────────────────────────────────────
  /** Status ring — cycles through empty→partial→full→partial */
  statusRing:  ["○", "◎", "●", "◉"] as const,
  /** Status dot — idle/active cycle */
  statusDot:   ["·", "•", "●", "•"] as const,
  /** Flow indicator — play/pause metaphor */
  flow:        ["▶", "‖", "▷", "‖"] as const,

  // ── CSS-geometric character approximations ───────────────────────────────
  /** Orbit feel — single trailing arc sweep */
  orbit:       ["⠿", "⣷", "⣯", "⣟", "⡿", "⢿", "⣻", "⣽"] as const,
  /** Comet — trailing emphasis */
  comet:       ["·   ", " ·  ", "  · ", "   ·", "  · ", " ·  "] as const,
  /** Trio — three-beat stutter */
  trio:        ["·  ", "·· ", "···", " ··", "  ·", "   "] as const,
  /** Equalizer — up/down bar feel */
  eq:          ["▁▃▅▇▅▃", "▃▅▇▅▃▁", "▅▇▅▃▁▃", "▇▅▃▁▃▅"] as const,

  // ── Nerd font ────────────────────────────────────────────────────────────
  /** Nerd play/pause cycle — requires Nerd Fonts */
  nerd:        ["\uf144", "\uf28b", "\uf04b", "\uf28b"] as const,
} as const;

export type SpinnerKey = keyof typeof spinnerFrames;

/**
 * Returns the best spinner for a given palette name.
 * Falls back to `dots` for unknown palettes.
 */
export const spinnerForPalette = (paletteName: string): readonly string[] => {
  const map: Record<string, SpinnerKey> = {
    "kanso":           "zen",
    "vesper":          "vesper",
    "cadet":           "square",
    "storm":           "halves",
    "tokyo-night":     "halves",
    "catppuccin-mocha":"dots",
    "catppuccin-latte":"dots",
    "nord":            "arc",
    "dracula":         "dots",
    "gruvbox-dark":    "bounce",
    "one-dark":        "dots",
    "solarized-dark":  "arc",
    "solarized-light": "arc",
    "grove":           "zen",
    "hyrule":          "statusRing",
    "orchid":          "arc",
    "razr":            "halves",
    "soho":            "dot",
    "spike":           "line",
  };
  const key = map[paletteName] ?? "dots";
  return spinnerFrames[key];
};

// ─── Animation ticker ─────────────────────────────────────────────────────────

/**
 * AnimationTicker — drives component invalidation at a given FPS.
 *
 * Usage:
 *   const ticker = new AnimationTicker();
 *   ticker.start(8, (state) => component.invalidate());
 *   // in render: use ticker.current as AnimationState
 *   ticker.stop(); // in destroy()
 */
export class AnimationTicker {
  private interval: ReturnType<typeof setInterval> | null = null;
  private _state: AnimationState = { frame: 0, startedAt: now() };

  start(fps: number, onTick: (state: AnimationState) => void): void {
    this.stop();
    this._state = { frame: 0, startedAt: now() };
    this.interval = setInterval(() => {
      this._state = { ...this._state, frame: this._state.frame + 1 };
      onTick(this._state);
    }, Math.round(1000 / fps));
  }

  stop(): void {
    if (this.interval !== null) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  get current(): AnimationState {
    return this._state;
  }

  get running(): boolean {
    return this.interval !== null;
  }
}

// ─── Reduced-motion guard ─────────────────────────────────────────────────────

/**
 * Wraps an animated value with a static fallback for reduced-motion contexts.
 * Pass `reducedMotion: true` (from theme config) to disable animations.
 */
export const withMotion = <T>(
  animated: () => T,
  fallback: T,
  reducedMotion: boolean,
): T => (reducedMotion ? fallback : animated());
