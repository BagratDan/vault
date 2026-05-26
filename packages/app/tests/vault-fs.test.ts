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

  it("bootstraps when VAULT_ROOT does not exist yet", async () => {
    const fresh = path.join(os.tmpdir(), `vault-fs-fresh-${Date.now()}`);
    const api = new VaultFs(fresh);
    await api.ensureDir("data");
    const st = await fs.stat(path.join(fresh, "data"));
    expect(st.isDirectory()).toBe(true);
    await fs.rm(fresh, { recursive: true, force: true });
  });
});

describe("VaultFs.resolveSafeAbsolute", () => {
  // resolveSafeAbsolute does not depend on VAULT_ROOT, so any root works.
  const fsApi = new VaultFs(os.tmpdir());

  it("accepts a path inside the user's home", async () => {
    const home = os.homedir();
    await expect(fsApi.resolveSafeAbsolute(home)).resolves.toBe(home);
  });

  it("rejects /etc/passwd", async () => {
    await expect(fsApi.resolveSafeAbsolute("/etc/passwd")).rejects.toThrow(
      /refuse-list/
    );
  });

  it("rejects /System/Library", async () => {
    await expect(fsApi.resolveSafeAbsolute("/System/Library")).rejects.toThrow(
      /refuse-list/
    );
  });

  it("rejects a non-absolute path", async () => {
    await expect(fsApi.resolveSafeAbsolute("relative/path")).rejects.toThrow(
      /not absolute/
    );
  });

  it("rejects a path whose ancestor is outside $HOME", async () => {
    await expect(fsApi.resolveSafeAbsolute("/tmp/some/dir")).rejects.toThrow(
      /outside \$HOME/
    );
  });
});
