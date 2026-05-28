import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FolderLocal } from "../src/folder-local.js";
import { newUlid } from "@vault/domain";

const HEX_64 = "a".repeat(64);
const now = "2026-05-26T10:00:00.000Z";

let dir: string;
let fl: FolderLocal;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "vault-folder-local-"));
  fl = new FolderLocal(dir);
  await fl.ready();
});

afterEach(async () => {
  await fl.close();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("FolderLocal", () => {
  it("put + get + list folders", async () => {
    const id1 = newUlid();
    const id2 = newUlid();
    await fl.putFolder({
      id: id1,
      createdAt: now,
      updatedAt: now,
      ownerPeerId: HEX_64,
      provenance: { kind: "user" },
      kind: "folder",
      path: "/Users/sarah/A",
      displayName: "A",
      visibility: "public",
    });
    await fl.putFolder({
      id: id2,
      createdAt: now,
      updatedAt: now,
      ownerPeerId: HEX_64,
      provenance: { kind: "user" },
      kind: "folder",
      path: "/Users/sarah/B",
      displayName: "B",
      visibility: "private",
    });
    const list = await fl.listFolders();
    expect(list).toHaveLength(2);
    const got = await fl.getFolder(id1);
    expect(got?.displayName).toBe("A");
  });

  it("put + list private memories filters by folderId", async () => {
    const folderA = newUlid();
    const folderB = newUlid();
    const mem = (folderId: string) => ({
      id: newUlid(),
      createdAt: now,
      updatedAt: now,
      ownerPeerId: HEX_64,
      provenance: { kind: "user" as const },
      summary: "x",
      body: "y",
      sourceRecordId: newUlid(),
      confidence: 0.5,
      tags: [],
      requestableScopes: ["metadata" as const, "snippet" as const, "file" as const],
      folderId,
    });
    await fl.putPrivateMemory(mem(folderA));
    await fl.putPrivateMemory(mem(folderA));
    await fl.putPrivateMemory(mem(folderB));
    const inA = await fl.listPrivateMemoriesByFolder(folderA);
    const inB = await fl.listPrivateMemoriesByFolder(folderB);
    expect(inA).toHaveLength(2);
    expect(inB).toHaveLength(1);
  });
});
