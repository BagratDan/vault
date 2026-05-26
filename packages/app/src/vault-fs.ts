import fs from "node:fs/promises";
import path from "node:path";

export interface WriteOptions {
  /** POSIX file mode. Defaults to 0o600 — readable/writable by owner only. */
  mode?: number;
}

export class VaultFs {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  /**
   * Resolve a relative path against VAULT_ROOT and verify it doesn't escape
   * the root either via .. segments OR via symlinks. Symlink resolution
   * walks the deepest existing ancestor through realpath; if any segment
   * already exists as a symlink pointing outside root, the call throws.
   */
  private async resolveSafe(rel: string): Promise<string> {
    const resolved = path.resolve(this.root, rel);
    if (resolved !== this.root && !resolved.startsWith(this.root + path.sep)) {
      throw new Error(`refused: ${rel} resolves outside VAULT_ROOT`);
    }
    // Find the deepest ancestor that exists, realpath it, and verify the
    // real ancestor is still under realpath(root).
    const realRoot = await fs.realpath(this.root).catch(() => this.root);
    let cursor = resolved;
    while (cursor !== path.dirname(cursor)) {
      try {
        const realCursor = await fs.realpath(cursor);
        if (realCursor !== realRoot && !realCursor.startsWith(realRoot + path.sep)) {
          throw new Error(`refused: ${rel} resolves outside VAULT_ROOT via symlink`);
        }
        break;
      } catch (err) {
        if (
          err &&
          typeof err === "object" &&
          "code" in err &&
          (err as { code: string }).code === "ENOENT"
        ) {
          cursor = path.dirname(cursor);
          continue;
        }
        throw err;
      }
    }
    return resolved;
  }

  async writeFile(
    rel: string,
    data: Uint8Array,
    options: WriteOptions = {}
  ): Promise<void> {
    const abs = await this.resolveSafe(rel);
    await fs.mkdir(path.dirname(abs), { recursive: true, mode: 0o700 });
    await fs.writeFile(abs, data, { mode: options.mode ?? 0o600 });
  }

  async readFile(rel: string): Promise<Uint8Array> {
    const abs = await this.resolveSafe(rel);
    return fs.readFile(abs);
  }

  async exists(rel: string): Promise<boolean> {
    try {
      const abs = await this.resolveSafe(rel);
      await fs.stat(abs);
      return true;
    } catch {
      return false;
    }
  }

  async ensureDir(rel: string): Promise<void> {
    const abs = await this.resolveSafe(rel);
    await fs.mkdir(abs, { recursive: true, mode: 0o700 });
  }
}
