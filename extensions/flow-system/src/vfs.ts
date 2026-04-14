import { Effect } from "effect";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { SkillLoadError } from "./types.js";

// In-process skill file cache — avoids re-reading disk for the same path within a session.
const cache = new Map<string, string>();

export const stageSkills = (paths: string[]): Effect.Effect<string, SkillLoadError> =>
	Effect.forEach(
		paths,
		(p) =>
			Effect.tryPromise({
				try: async () => {
					if (!cache.has(p)) {
						cache.set(p, await Bun.file(p).text());
					}
					return cache.get(p) as string;
				},
				catch: (e) => new SkillLoadError({ path: p, reason: String(e) }),
			}),
		{ concurrency: "unbounded" },
	).pipe(Effect.map((parts) => parts.join("\n\n---\n\n")));

export const writeTempSkillFile = (content: string): Effect.Effect<string> =>
	Effect.promise(async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-flow-"));
		const file = path.join(dir, "skills.md");
		await fs.writeFile(file, content, "utf8");
		return file;
	});

export const cleanupTempFile = (file: string): Effect.Effect<void> =>
	Effect.promise(async () => {
		await fs.unlink(file).catch(() => {});
		await fs.rmdir(path.dirname(file)).catch(() => {});
	});
