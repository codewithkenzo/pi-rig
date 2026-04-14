/**
 * Shared subprocess utilities — SpawnResult type + a reusable Effect-based runner.
 * All extension subprocess bridges (tk, git, sox, pi) use this interface.
 */

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

const DEFAULT_MAX_OUTPUT = 256 * 1024; // 256KB

/**
 * Runs a command and returns a SpawnResult.
 * Non-zero exit codes do NOT throw — caller decides what to do.
 */
export const spawnCollect = async (
  argv: string[],
  opts: SpawnOptions = {},
): Promise<SpawnResult> => {
  const { cwd, env, timeoutMs, maxOutputBytes = DEFAULT_MAX_OUTPUT } = opts;
  const start = Date.now();

  const [cmd, ...args] = argv;
  if (!cmd) throw new Error("spawnCollect: empty argv");

  const proc = Bun.spawn([cmd, ...args], {
    cwd,
    env: env ?? (process.env as Record<string, string>),
    stdout: "pipe",
    stderr: "pipe",
  });

  let aborted = false;
  const timer = timeoutMs
    ? setTimeout(() => {
        aborted = true;
        proc.kill();
      }, timeoutMs)
    : null;

  const [rawOut, rawErr] = await Promise.all([
    collectStream(proc.stdout, maxOutputBytes),
    collectStream(proc.stderr, maxOutputBytes),
  ]);

  if (timer) clearTimeout(timer);

  await proc.exited;

  return {
    stdout: rawOut,
    stderr: rawErr,
    exitCode: aborted ? 124 : (proc.exitCode ?? -1),
    durationMs: Date.now() - start,
  };
};

const collectStream = async (
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<string> => {
  if (!stream) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of stream) {
    if (total + chunk.byteLength > maxBytes) {
      chunks.push(chunk.slice(0, maxBytes - total));
      break;
    }
    chunks.push(chunk);
    total += chunk.byteLength;
  }
  return new TextDecoder().decode(
    chunks.reduce((acc, c) => {
      const merged = new Uint8Array(acc.byteLength + c.byteLength);
      merged.set(acc);
      merged.set(c, acc.byteLength);
      return merged;
    }, new Uint8Array(0)),
  );
};

/** Checks if a binary is available in PATH. */
export const binaryExists = async (name: string): Promise<boolean> => {
  const result = await spawnCollect(["which", name]).catch(() => null);
  return result !== null && result.exitCode === 0;
};
