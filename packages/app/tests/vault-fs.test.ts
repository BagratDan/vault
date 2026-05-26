import { describe, expect, it, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { VaultFs } from "../src/vault-fs.js";

describe("VaultFs", () => {
  let root: string;
  let fsApi: VaultFs;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-fs-"));
    fsApi = new VaultFs(root);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("writeFile + readFile within root works", async () => {
    await fsApi.writeFile("notes/a.txt", new TextEncoder().encode("hello"));
    const got = await fsApi.readFile("notes/a.txt");
    expect(new TextDecoder().decode(got)).toBe("hello");
  });

  it("rejects writes that escape root via ..", async () => {
    await expect(
      fsApi.writeFile("../escape.txt", new Uint8Array([0]))
    ).rejects.toThrow(/outside VAULT_ROOT/);
  });

  it("rejects reads of absolute paths outside root", async () => {
    await expect(fsApi.readFile("/etc/passwd")).rejects.toThrow(/outside VAULT_ROOT/);
  });

  it("creates parent directories on write", async () => {
    await fsApi.writeFile("a/b/c.txt", new TextEncoder().encode("x"));
    const exists = await fs.stat(path.join(root, "a/b/c.txt"));
    expect(exists.isFile()).toBe(true);
  });
});
