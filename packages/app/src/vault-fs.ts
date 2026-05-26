import fs from "node:fs/promises";
import path from "node:path";

export class VaultFs {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  private resolve(rel: string): string {
    const resolved = path.resolve(this.root, rel);
    if (resolved !== this.root && !resolved.startsWith(this.root + path.sep)) {
      throw new Error(`refused: ${rel} resolves outside VAULT_ROOT`);
    }
    return resolved;
  }

  async writeFile(rel: string, data: Uint8Array): Promise<void> {
    const abs = this.resolve(rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, data);
  }

  async readFile(rel: string): Promise<Uint8Array> {
    const abs = this.resolve(rel);
    return fs.readFile(abs);
  }

  async exists(rel: string): Promise<boolean> {
    try {
      await fs.stat(this.resolve(rel));
      return true;
    } catch {
      return false;
    }
  }

  async ensureDir(rel: string): Promise<void> {
    await fs.mkdir(this.resolve(rel), { recursive: true });
  }
}
