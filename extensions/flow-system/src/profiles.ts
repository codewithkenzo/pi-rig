import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Value } from "@sinclair/typebox/value";
import { Effect } from "effect";
import { type FlowProfile, FlowProfileSchema, ProfileNotFoundError } from "./types.js";

export const BUILT_IN_PROFILES: readonly FlowProfile[] = [
	{
		name: "explore",
		description: "Quick scans, grep, file lookups",
		reasoning_level: "low",
		model: "gpt-5.4-mini",
		models: ["claude-haiku-4-5", "gemini-2.5-flash"],
		toolsets: ["terminal", "file"],
		skills: [],
	},
	{
		name: "research",
		description: "Deep web research, synthesis",
		reasoning_level: "medium",
		model: "gpt-5.4-mini",
		models: ["claude-sonnet-4-6", "gemini-2.5-pro"],
		toolsets: ["terminal", "file", "web"],
		skills: [],
	},
	{
		name: "coder",
		description: "Writing code, multi-file impl",
		reasoning_level: "high",
		model: "gpt-5.4-mini",
		models: ["gpt-5.3-codex", "claude-sonnet-4-6"],
		toolsets: ["code_execution"],
		skills: [],
	},
	{
		name: "debug",
		description: "Root-cause analysis, hard bugs",
		reasoning_level: "xhigh",
		model: "gpt-5.4",
		models: ["claude-opus-4-1", "claude-sonnet-4-6"],
		toolsets: [],
		skills: [],
	},
	{
		name: "browser",
		description: "Visual QA, page interaction",
		reasoning_level: "medium",
		model: "gpt-5.4-mini",
		models: ["claude-sonnet-4-6", "gemini-2.5-pro"],
		toolsets: ["browser"],
		skills: [],
	},
	{
		name: "ambivalent",
		description: "Default, mixed work",
		reasoning_level: "medium",
		model: "gpt-5.4-mini",
		models: ["gpt-5.3-codex", "claude-sonnet-4-6"],
		toolsets: [],
		skills: [],
	},
] as const;

export type ProfileLoadOptions = {
	readonly homeDir?: string;
};

export function loadProfiles(cwd: string, options: ProfileLoadOptions = {}): FlowProfile[] {
	const sources = [
		path.join(options.homeDir ?? os.homedir(), ".pi", "agent", "flow-profiles.json"),
		path.join(cwd, ".pi", "flow-profiles.json"),
	];

	const map = new Map<string, FlowProfile>(BUILT_IN_PROFILES.map((p) => [p.name, p]));

	for (const src of sources) {
		try {
			const raw = JSON.parse(fs.readFileSync(src, "utf8")) as unknown;
			if (!Array.isArray(raw)) continue;
			for (const item of raw) {
				if (typeof item !== "object" || item === null || Array.isArray(item)) {
					continue;
				}
				const normalized = { ...(item as Record<string, unknown>) };
				if ("max_iterations" in normalized) {
					delete normalized["max_iterations"];
				}
				if (Value.Check(FlowProfileSchema, normalized)) {
					map.set(normalized.name, normalized);
				}
			}
		} catch {
			// file not found or invalid JSON — skip silently
		}
	}

	return Array.from(map.values());
}

export function getProfile(
	name: string,
	cwd: string,
	options: ProfileLoadOptions = {},
): Effect.Effect<FlowProfile, ProfileNotFoundError> {
	return Effect.suspend(() => {
		const found = loadProfiles(cwd, options).find((profile) => profile.name === name);
		return found !== undefined
			? Effect.succeed(found)
			: Effect.fail(new ProfileNotFoundError({ name }));
	});
}
