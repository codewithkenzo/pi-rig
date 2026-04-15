import { Effect } from "effect";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { SkillLoadError } from "./types.js";

// In-process skill file cache — avoids re-reading disk for the same path within a session.
// Capped at MAX_CACHE_SIZE entries; oldest entry is evicted on overflow (insertion-order LRU).
// inflight deduplicates concurrent misses for the same path — only one read fires per path.
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
					// Relative paths resolve against the job's cwd, not the host process cwd.
					// Resolve symlinks before the root check — prevents symlink-bypass attacks
					// where a link inside an allowed root points outside it.
					const rawResolved = path.isAbsolute(p) ? p : path.resolve(cwd, p);
					const resolvedPath = await fs.realpath(rawResolved);
					const allowedRoots = [
						await fs.realpath(path.resolve(os.homedir(), ".pi")).catch(() => path.resolve(os.homedir(), ".pi")),
						// Use job cwd (not host process.cwd()) so skills relative to the job dir pass.
						await fs.realpath(path.resolve(cwd)).catch(() => path.resolve(cwd)),
					];
					const allowed = allowedRoots.some((root) => isWithinRoot(resolvedPath, root));

					if (!allowed) {
						throw new Error(
							`Skill path must be under ${allowedRoots[0]} or ${allowedRoots[1]}`,
						);
					}

					if (!cache.has(resolvedPath)) {
						// Deduplicate concurrent misses — only one disk read per path at a time.
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
									// Always clear — if the read fails, future callers must be able to retry.
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
	// Remove the entire temp dir in one call — handles partial writes and non-empty dirs.
	Effect.promise(() => fs.rm(path.dirname(file), { recursive: true, force: true }));
