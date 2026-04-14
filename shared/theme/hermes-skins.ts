/**
 * Hermes skin loader — reads ~/.hermes/skins/*.yaml at runtime and converts
 * each skin into a Palette that the theme engine can use.
 *
 * This is a zero-dep minimal YAML parser for the specific format used by
 * Hermes skins. It only handles:
 *   - Simple key: value pairs at any indentation
 *   - String values (hex colors, plain strings)
 *   - Array items with "- item" format
 *
 * It does NOT handle full YAML (anchors, multi-line, etc.).
 */

import { join } from "node:path";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import type { Palette, SemanticToken } from "./types.js";

const HERMES_SKINS_DIR = join(homedir(), ".hermes", "skins");

// ─── Minimal YAML parser ──────────────────────────────────────────────────────

interface ParsedSkin {
  name: string;
  description: string;
  colors: Record<string, string>;
  animations: {
    flow_running_frames: string[];
    tool_active_frames: string[];
    streaming_ball_frames: string[];
    flow_done_symbol: string;
    flow_failed_symbol: string;
    flow_cancelled_symbol: string;
    flow_pending_symbol: string;
  };
  spinner: { interval: number };
}

const parseHermesSkin = (yaml: string): ParsedSkin | null => {
  try {
    const lines = yaml.split("\n");
    let section = "";
    const colors: Record<string, string> = {};
    const animations: ParsedSkin["animations"] = {
      flow_running_frames: [],
      tool_active_frames: [],
      streaming_ball_frames: [],
      flow_done_symbol: "✓",
      flow_failed_symbol: "✗",
      flow_cancelled_symbol: "⊘",
      flow_pending_symbol: "○",
    };
    const spinner = { interval: 0.15 };
    let name = "";
    let description = "";
    let currentArray: string[] | null = null;

    for (const raw of lines) {
      const line = raw.trimEnd();
      if (line.startsWith("#") || line.trim() === "") continue;

      // Section detection (no leading spaces)
      if (/^[a-z]/.test(line)) {
        const [k, ...rest] = line.split(":");
        const v = rest.join(":").trim().replace(/^["']|["']$/g, "").split("#")[0]!.trim();
        section = (k ?? "").trim();
        currentArray = null;

        if (section === "name") { name = v; continue; }
        if (section === "description") { description = v; continue; }
      }

      // Subsection (2 spaces)
      if (/^  [a-z_]/.test(line) && !/^   /.test(line)) {
        currentArray = null;
        const trimmed = line.trimStart();
        const colonIdx = trimmed.indexOf(":");
        if (colonIdx === -1) continue;
        const k = trimmed.slice(0, colonIdx).trim();
        const v = trimmed.slice(colonIdx + 1).split("#")[0]!.trim().replace(/^["']|["']$/g, "");

        if (section === "colors") {
          if (v) colors[k] = v;
        } else if (section === "animations") {
          if (v) {
            (animations as Record<string, unknown>)[k] = v;
          } else {
            // Start of an array
            currentArray = [];
            (animations as Record<string, unknown>)[k] = currentArray;
          }
        } else if (section === "spinner") {
          if (k === "interval") spinner.interval = parseFloat(v) || 0.15;
        }
        continue;
      }

      // Array items (4 spaces + "- ")
      if (/^    - /.test(line) && currentArray !== null) {
        const item = line.replace(/^    - /, "").trim().replace(/^["']|["']$/g, "");
        currentArray.push(item);
      }
    }

    if (!name) return null;
    return { name, description, colors, animations, spinner };
  } catch {
    return null;
  }
};

// ─── Convert parsed skin → Palette ───────────────────────────────────────────

const skinToPalette = (skin: ParsedSkin): Palette => {
  const c = skin.colors;
  const get = (key: string, fallback: string): string => {
    const v = c[key];
    return v && v !== "transparent" ? v : fallback;
  };

  const semantic: Record<SemanticToken, string> = {
    accent:    get("ui_accent", "#888888"),
    success:   get("ui_ok", "#88cc88"),
    error:     get("ui_error", "#cc8888"),
    warning:   get("ui_warn", "#ccaa88"),
    muted:     get("banner_dim", "#666666"),
    dim:       get("status_bar_text", get("status_bar_dim", "#555555")),
    text:      get("banner_text", get("prompt", "#cccccc")),
    border:    get("banner_border", "#444444"),
    highlight: get("banner_accent", get("ui_accent", "#888888")),
    info:      get("ui_label", "#aaaaaa"),
    active:    get("status_bar_good", get("ui_ok", "#88cc88")),
    inactive:  get("banner_dim", "#666666"),
    header:    get("banner_title", "#cccccc"),
    label:     get("ui_label", "#aaaaaa"),
    value:     get("banner_text", "#cccccc"),
    separator: get("banner_border", "#444444"),
  };

  const anim = skin.animations;
  const animations: Palette["animations"] = {
    runningFrames:   anim.flow_running_frames.length ? anim.flow_running_frames : ["⠋", "⠙", "⠹", "⠸"],
    toolFrames:      anim.tool_active_frames.length ? anim.tool_active_frames : ["▏", "▎", "▍", "▌"],
    streamingFrames: anim.streaming_ball_frames.length ? anim.streaming_ball_frames : ["⠋", "⠙", "⠹"],
    doneSymbol:      anim.flow_done_symbol,
    failedSymbol:    anim.flow_failed_symbol,
    cancelledSymbol: anim.flow_cancelled_symbol,
    pendingSymbol:   anim.flow_pending_symbol,
    spinnerInterval: skin.spinner.interval,
  };

  return {
    name: skin.name,
    variant: "dark",
    description: skin.description || `Hermes skin: ${skin.name}`,
    source: "hermes",
    semantic,
    raw: skin.colors,
    animations,
  };
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Loads all Hermes skins from ~/.hermes/skins/*.yaml.
 * Returns an empty array if the directory doesn't exist.
 * Silently skips files that fail to parse.
 */
export const loadHermesSkins = (): Palette[] => {
  if (!existsSync(HERMES_SKINS_DIR)) return [];

  const palettes: Palette[] = [];
  let files: string[];
  try {
    files = readdirSync(HERMES_SKINS_DIR).filter((name: string) => name.endsWith(".yaml"));
  } catch {
    return [];
  }

  for (const file of files) {
    try {
      const raw = readFileSync(join(HERMES_SKINS_DIR, file), "utf8");
      const parsed = parseHermesSkin(raw);
      if (parsed) palettes.push(skinToPalette(parsed));
    } catch {
      // skip unparseable skins
    }
  }

  return palettes;
};

/**
 * Loads a single Hermes skin by name from ~/.hermes/skins/<name>.yaml.
 */
export const loadHermesSkin = (name: string): Palette | null => {
  const path = join(HERMES_SKINS_DIR, `${name}.yaml`);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = parseHermesSkin(raw);
    return parsed ? skinToPalette(parsed) : null;
  } catch {
    return null;
  }
};
