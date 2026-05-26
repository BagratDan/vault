import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { scanFolder } from "../src/scan-folder.js";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "vault-scan-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function touch(rel: string, content = "x"): Promise<void> {
  const p = path.join(dir, rel);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content);
}

describe("scanFolder", () => {
  it("returns supported files", async () => {
    await touch("note.txt", "hello");
    await touch("doc.pdf", "fake");
    await touch("readme.md", "# hi");
    await touch("ignored.zip", "x");
    const got = await scanFolder(dir);
    const names = got.map((g) => path.basename(g.absPath)).sort();
    expect(names).toEqual(["doc.pdf", "note.txt", "readme.md"]);
  });

  it("skips hidden files", async () => {
    await touch(".secret.txt");
    await touch("visible.txt");
    const got = await scanFolder(dir);
    expect(got.map((g) => path.basename(g.absPath))).toEqual(["visible.txt"]);
  });

  it("skips node_modules and .git directories", async () => {
    await touch("node_modules/pkg/index.txt");
    await touch(".git/HEAD");
    await touch("src/main.md");
    const got = await scanFolder(dir);
    expect(got.map((g) => path.basename(g.absPath))).toEqual(["main.md"]);
  });

  it("skips files > maxFileBytes", async () => {
    await touch("small.txt", "x");
    await touch("big.txt", "x".repeat(20));
    const got = await scanFolder(dir, { maxFileBytes: 5 });
    expect(got.map((g) => path.basename(g.absPath))).toEqual(["small.txt"]);
  });

  it("respects maxDepth", async () => {
    await touch("a/b/c/d/e/f/g/i/j/k/deep.txt");
    await touch("shallow.txt");
    const got = await scanFolder(dir, { maxDepth: 2 });
    const names = got.map((g) => path.basename(g.absPath));
    expect(names).toContain("shallow.txt");
    expect(names).not.toContain("deep.txt");
  });
});
