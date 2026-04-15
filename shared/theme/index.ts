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
  for (const p of loadHermesSkins()) {
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

export const loadTheme = (cwd: string): ThemeResult => {
  ensureHermesSkinsLoaded();
  const config = loadPluginConfig("theme", defaultThemeConfig, cwd) as ThemeConfig;
  let palette: Palette;

  try {
    palette = getPalette(config.active);
  } catch {
    palette = getPalette("catppuccin-mocha");
  }

  if (config.custom && Object.keys(config.custom).length > 0) {
    palette = fromOverrides(palette, config.custom as Partial<Record<SemanticToken, string>>);
  }

  const engine = createEngine(palette, config.colorMode as ColorMode);
  return { engine, palette, config };
};
