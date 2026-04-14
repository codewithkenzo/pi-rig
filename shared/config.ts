import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";

/**
 * Plugin config loader — 5-level precedence:
 * 1. Built-in defaults
 * 2. Global ~/.pi/agent/<plugin>.json
 * 3. Project <cwd>/.pi/<plugin>.json
 * 4. Environment variables (PI_<PLUGIN>_<KEY>)
 * 5. Per-tool-call overrides (handled by caller)
 */
export const loadPluginConfig = <T extends Record<string, unknown>>(
  name: string,
  defaults: T,
  cwd: string,
): T => {
  const global = tryReadJson(join(homedir(), ".pi", "agent", `${name}.json`));
  const project = tryReadJson(join(cwd, ".pi", `${name}.json`));
  const env = collectEnvOverrides(name);
  return deepMerge(defaults, global ?? {}, project ?? {}, env) as T;
};

const tryReadJson = (path: string): Record<string, unknown> | null => {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
};

// Reads PI_<PLUGIN>_<KEY>=value env vars → nested key
const collectEnvOverrides = (plugin: string): Record<string, unknown> => {
  const prefix = `PI_${plugin.toUpperCase().replace(/-/g, "_")}_`;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith(prefix) || v === undefined) continue;
    const key = k.slice(prefix.length).toLowerCase();
    result[key] = parseEnvValue(v);
  }
  return result;
};

const parseEnvValue = (v: string): unknown => {
  if (v === "true") return true;
  if (v === "false") return false;
  const n = Number(v);
  if (!Number.isNaN(n)) return n;
  return v;
};

const deepMerge = (...sources: Record<string, unknown>[]): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const src of sources) {
    for (const [k, v] of Object.entries(src)) {
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        result[k] = deepMerge(
          (result[k] as Record<string, unknown>) ?? {},
          v as Record<string, unknown>,
        );
      } else {
        result[k] = v;
      }
    }
  }
  return result;
};
