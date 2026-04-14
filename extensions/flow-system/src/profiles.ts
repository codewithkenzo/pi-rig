import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Value } from "@sinclair/typebox/value";
import { Effect } from "effect";
import { type FlowProfile, FlowProfileSchema, ProfileNotFoundError } from "./types.js";

// ── Built-in profiles ─────────────────────────────────────────────────────────

export const BUILT_IN_PROFILES: readonly FlowProfile[] = [
	{
		name: "explore",
		description: "Quick scans, grep, file lookups",
		reasoning_level: "low",
		max_iterations: 11,
		toolsets: ["terminal", "file"],
		skills: [],
	},
	{
		name: "research",
		description: "Deep web research, synthesis",
		reasoning_level: "medium",
		max_iterations: 18,
		toolsets: ["terminal", "file", "web"],
		skills: [],
	},
	{
		name: "coder",
		description: "Writing code, multi-file impl",
		reasoning_level: "medium",
		max_iterations: 35,
		toolsets: ["code_execution"],
		skills: [],
	},
	{
		name: "debug",
		description: "Root-cause analysis, hard bugs",
		reasoning_level: "high",
		max_iterations: 20,
		toolsets: [],
		skills: [],
	},
	{
		name: "browser",
		description: "Visual QA, page interaction",
		reasoning_level: "medium",
		max_iterations: 25,
		toolsets: ["browser"],
		skills: [],
	},
	{
		name: "ambivalent",
		description: "Default, mixed work",
		reasoning_level: "medium",
		max_iterations: 18,
		toolsets: [],
		skills: [],
	},
] as const;

// ── Profile loading ───────────────────────────────────────────────────────────

/**
 * Loads profiles by merging built-ins with optional user overrides.
 *
 * Sources (in order, later wins):
 *   1. ~/.pi/agent/flow-profiles.json
 *   2. <cwd>/.pi/flow-profiles.json
 *
 * Invalid JSON and non-existent files are silently skipped.
 * Items that fail TypeBox validation are silently skipped.
 */
export function loadProfiles(cwd: string): FlowProfile[] {
	const sources = [
		path.join(os.homedir(), ".pi", "agent", "flow-profiles.json"),
		path.join(cwd, ".pi", "flow-profiles.json"),
	];

	const map = new Map<string, FlowProfile>(BUILT_IN_PROFILES.map((p) => [p.name, p]));

	for (const src of sources) {
		try {
			const raw = JSON.parse(fs.readFileSync(src, "utf8")) as unknown;
			if (!Array.isArray(raw)) continue;
			for (const item of raw) {
				if (Value.Check(FlowProfileSchema, item)) {
					map.set(item.name, item);
				}
			}
		} catch {
			// file not found or invalid JSON — skip silently
		}
	}

	return Array.from(map.values());
}

// ── Effect accessor ───────────────────────────────────────────────────────────

/**
 * Looks up a profile by name within the merged profile set.
 * Fails with ProfileNotFoundError if the name is not present.
 */
export function getProfile(
	name: string,
	cwd: string,
): Effect.Effect<FlowProfile, ProfileNotFoundError> {
	return Effect.sync(() => loadProfiles(cwd)).pipe(
		Effect.flatMap((profiles) => {
			const found = profiles.find((p) => p.name === name);
			return found !== undefined
				? Effect.succeed(found)
				: Effect.fail(new ProfileNotFoundError({ name }));
		}),
	);
}
