import { Effect } from "effect";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { SkillLoadError } from "./types.js";

const MAX_CACHE_SIZE = 128;
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

const isWithinRoot = (candidate: string, root: string): boolean => {
	const rel = path.relative(root, candidate);
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

export const stageSkills = (paths: string[], cwd = process.cwd()): Effect.Effect<string, SkillLoadError> =>
	Effect.forEach(
		paths,
		(p) =>
			Effect.tryPromise({
				try: async () => {
					const rawResolved = path.isAbsolute(p) ? p : path.resolve(cwd, p);
					const resolvedPath = await fs.realpath(rawResolved);
					const allowedRoots = [
						await fs.realpath(path.resolve(os.homedir(), ".pi")).catch(() => path.resolve(os.homedir(), ".pi")),
						await fs.realpath(path.resolve(cwd)).catch(() => path.resolve(cwd)),
					];
					const allowed = allowedRoots.some((root) => isWithinRoot(resolvedPath, root));

					if (!allowed) {
						throw new Error(
							`Skill path must be under ${allowedRoots[0]} or ${allowedRoots[1]}`,
						);
					}

					if (!cache.has(resolvedPath)) {
						let p = inflight.get(resolvedPath);
						if (p === undefined) {
							p = (async () => {
								try {
									const text = await Bun.file(resolvedPath).text();
									if (cache.size >= MAX_CACHE_SIZE) {
										const oldest = cache.keys().next().value;
										if (oldest !== undefined) cache.delete(oldest);
									}
									cache.set(resolvedPath, text);
									return text;
								} finally {
									inflight.delete(resolvedPath);
								}
							})();
							inflight.set(resolvedPath, p);
						}
						await p;
					}
					return cache.get(resolvedPath) as string;
				},
				catch: (e) => new SkillLoadError({ path: p, reason: String(e) }),
			}),
		{ concurrency: 8 },
	).pipe(Effect.map((parts) => parts.join("\n\n---\n\n")));

export const writeTempSkillFile = (content: string): Effect.Effect<string> =>
	Effect.promise(async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-flow-"));
		const file = path.join(dir, "skills.md");
		await fs.writeFile(file, content, "utf8");
		return file;
	});

export const cleanupTempFile = (file: string): Effect.Effect<void> =>
	Effect.promise(() => fs.rm(path.dirname(file), { recursive: true, force: true }));
