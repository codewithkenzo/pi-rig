import { Effect } from "effect";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { SkillLoadError } from "./types.js";

// In-process skill file cache — avoids re-reading disk for the same path within a session.
const cache = new Map<string, string>();

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
						await fs.realpath(path.resolve(process.cwd())).catch(() => path.resolve(process.cwd())),
					];
					const allowed = allowedRoots.some((root) => isWithinRoot(resolvedPath, root));

					if (!allowed) {
						throw new Error(
							`Skill path must be under ${allowedRoots[0]} or ${allowedRoots[1]}`,
						);
					}

					if (!cache.has(resolvedPath)) {
						cache.set(resolvedPath, await Bun.file(resolvedPath).text());
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
	Effect.promise(async () => {
		await fs.unlink(file).catch(() => {});
		await fs.rmdir(path.dirname(file)).catch(() => {});
	});
