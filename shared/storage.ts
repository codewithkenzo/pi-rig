import { join } from "node:path";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

/**
 * Pluggable storage backend — local file system (default) or Cloudflare R2.
 * Extensions use this interface; they don't care which backend is active.
 */
export interface StorageBackend {
  put(key: string, data: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

// ─── Local backend ──────────────────────────────────────────────────────────

export class LocalStorage implements StorageBackend {
  constructor(private readonly root: string) {}

  private path(key: string): string {
    // Prevent path traversal
    const safe = key.replace(/\.\./g, "_").replace(/^\//, "");
    return join(this.root, safe);
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const p = this.path(key);
    await mkdir(join(p, ".."), { recursive: true });
    await writeFile(p, data);
  }

  async get(key: string): Promise<Uint8Array | null> {
    const p = this.path(key);
    if (!existsSync(p)) return null;
    const buf = await readFile(p);
    return new Uint8Array(buf.buffer);
  }

  async delete(key: string): Promise<void> {
    const p = this.path(key);
    if (existsSync(p)) await unlink(p);
  }

  async list(prefix: string): Promise<string[]> {
    const glob = new Bun.Glob(`${prefix}**`);
    const matches: string[] = [];
    for await (const file of glob.scan({ cwd: this.root })) {
      matches.push(file);
    }
    return matches;
  }
}

// ─── R2 backend (Bun.s3 bindings, Bun ≥ 1.1.20) ─────────────────────────────

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

// Minimal interface for the Bun.s3 client we need
interface S3Client {
  write(key: string, data: Uint8Array): Promise<void>;
  file(key: string): { arrayBuffer(): Promise<ArrayBuffer> };
  delete(key: string): Promise<void>;
  list(opts: { prefix: string }): Promise<{ contents: { key: string }[] }>;
}

declare const Bun: typeof import("bun") & {
  s3?: (cfg: object) => S3Client;
};

export class R2Storage implements StorageBackend {
  private readonly client: S3Client;

  constructor(cfg: R2Config) {
    if (typeof Bun.s3 !== "function") {
      throw new Error("R2Storage requires Bun ≥ 1.1.20 with Bun.s3 support");
    }
    this.client = Bun.s3({
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      bucket: cfg.bucket,
    });
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    await this.client.write(key, data);
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const buf = await this.client.file(key).arrayBuffer();
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.delete(key);
  }

  async list(prefix: string): Promise<string[]> {
    const result = await this.client.list({ prefix });
    return result.contents.map((o) => o.key);
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export interface StorageConfig {
  provider: "local" | "r2";
  localRoot?: string;
  r2?: R2Config;
}

export const createStorage = (cfg: StorageConfig): StorageBackend => {
  if (cfg.provider === "r2") {
    if (!cfg.r2) throw new Error("R2 config required when provider=r2");
    return new R2Storage(cfg.r2);
  }
  const root = cfg.localRoot ?? join(homedir(), ".pi", "storage");
  return new LocalStorage(root);
};
