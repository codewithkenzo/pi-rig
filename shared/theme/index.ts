/**
 * @codewithkenzo/pi-shared — Theme Engine
 *
 * Public API. Import from "../../shared/theme" in any extension.
 *
 * Usage:
 *   import { loadTheme, pulse, shimmer, spinnerFrames } from "../../shared/theme";
 *   const { engine, palette } = loadTheme(cwd);
 *   engine.fg("accent", "Running 2 flows...");
 */

export { createEngine, hexToRgb, type ThemeEngine } from "./engine.js";
export {
  linearGradient, rainbowGradient, multiGradient,
} from "./gradient.js";
export {
  pulse, breathe, fadeIn, shimmer, spin,
  spinnerFrames, AnimationTicker, withMotion,
  type AnimationState, type SpinnerKey,
} from "./animation.js";
export {
  renderPalettePreview, renderPaletteList, renderPaletteEntry,
} from "./preview.js";
export {
  // Extension palettes
  catppuccinMocha, catppuccinLatte,
  nord, dracula,
  tokyoNight, gruvboxDark, oneDark,
  solarizedDark, solarizedLight,
  // Hermes skins (pre-converted)
  hermesCadet, hermesGrove, hermesHyrule, hermesKanso,
  hermesOrchid, hermesRazr, hermesSoho, hermesSpike,
  hermesStorm, hermesVesper,
  // Registry
  BUILTIN_PALETTES, PALETTE_MAP,
  getPalette, fromOverrides,
} from "./palette.js";
export {
  loadHermesSkins, loadHermesSkin,
} from "./hermes-skins.js";
export {
  type SemanticToken, type ColorMode, type ThemeConfig,
  defaultThemeConfig, ThemeConfigSchema,
} from "./types.js";

// ─── Convenience: loadTheme ───────────────────────────────────────────────────

import { loadPluginConfig } from "../config.js";
import { createEngine } from "./engine.js";
import { getPalette, PALETTE_MAP, fromOverrides } from "./palette.js";
import { loadHermesSkins } from "./hermes-skins.js";
import { defaultThemeConfig, type ThemeConfig, type ColorMode } from "./types.js";
import type { ThemeEngine } from "./engine.js";
import type { Palette } from "./types.js";
import type { SemanticToken } from "./types.js";

let _hermesSkinsLoaded = false;

const ensureHermesSkinsLoaded = (): void => {
  if (_hermesSkinsLoaded) return;
  _hermesSkinsLoaded = true;
  // Register hermes skins into the map (live ones from ~/.hermes/skins/)
  for (const p of loadHermesSkins()) {
    // Don't override pre-converted builtins
    if (!PALETTE_MAP.has(p.name)) {
      PALETTE_MAP.set(p.name, p);
    }
  }
};

export interface ThemeResult {
  engine: ThemeEngine;
  palette: Palette;
  config: ThemeConfig;
}

/**
 * Loads the active theme from config and returns a ready ThemeEngine.
 * Call once per extension init — the result is a plain object, cheap to store.
 *
 * @param cwd - Project directory (used for config precedence lookup)
 */
export const loadTheme = (cwd: string): ThemeResult => {
  ensureHermesSkinsLoaded();
  const config = loadPluginConfig("theme", defaultThemeConfig, cwd) as ThemeConfig;
  let palette: Palette;

  try {
    palette = getPalette(config.active);
  } catch {
    palette = getPalette("catppuccin-mocha");
  }

  // Apply custom token overrides from config
  if (config.custom && Object.keys(config.custom).length > 0) {
    palette = fromOverrides(palette, config.custom as Partial<Record<SemanticToken, string>>);
  }

  const engine = createEngine(palette, config.colorMode as ColorMode);
  return { engine, palette, config };
};
