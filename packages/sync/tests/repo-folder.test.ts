import { describe, it, expect } from "vitest";
import { Repo } from "../src/repo.js";
import { Indexes } from "../src/indexes.js";
import { newUlid } from "@vault/domain";

function makeBackend() {
  const store = new Map<string, unknown>();
  const view = {
    async get(key: string) {
      return store.has(key) ? { value: store.get(key) } : null;
    },
    async *createReadStream({ gte, lt }: { gte?: string; lt?: string }) {
      for (const key of [...store.keys()].sort()) {
        if (gte && key < gte) continue;
        if (lt && key >= lt) continue;
        yield { key, value: store.get(key) };
      }
    },
  };
  const append = async (op: unknown) => {
    const o = op as { key: string; value: unknown };
    store.set(o.key, o.value);
  };
  return { view, append, store };
}

function makeMemory(folderId: string, overrides: Record<string, unknown> = {}) {
  const t = "2026-05-27T00:00:00.000Z";
  return {
    id: newUlid(), createdAt: t, updatedAt: t, ownerPeerId: "a".repeat(64),
    provenance: { kind: "user" as const }, summary: "s", body: "b",
    sourceRecordId: newUlid(), confidence: 1, tags: [],
    requestableScopes: ["snippet" as const], folderId,
    ...overrides,
  };
}

describe("listMemoriesInFolder via folder index", () => {
  it("returns only memories indexed under the folder", async () => {
    const { view, append } = makeBackend();
    const repo = new Repo({ view, append, ownerPeerId: "a".repeat(64) });
    const indexes = new Indexes({ view, append });
    const folderId = newUlid();
    const mem = makeMemory(folderId);
    await repo.putMemory(mem);
    await indexes.indexFolderMembership(folderId, mem.id);
    const out = await repo.listMemoriesInFolder(folderId, indexes);
    expect(out.map((m) => m.id)).toEqual([mem.id]);
  });

  // Regression: runIngest writes public memories via putMemoryByVisibility AND
  // must also call indexFolderMembership (listMemoriesInFolder is index-
  // exclusive for public hits). This mirrors the runIngest write sequence on a
  // real Repo+Indexes so a public file-ingested memory stays discoverable —
  // without the index write fileCount would be 0.
  it("a public file-ingested memory is discoverable (runIngest write sequence)", async () => {
    const { view, append } = makeBackend();
    const repo = new Repo({ view, append, ownerPeerId: "a".repeat(64) });
    const indexes = new Indexes({ view, append });
    const folderId = newUlid();
    const mem = makeMemory(folderId);
    // Exactly what runIngest does for a PUBLIC folder memory:
    await repo.putMemoryByVisibility(mem, "public");
    await indexes.indexFolderMembership(folderId, mem.id);
    await indexes.indexMeta(mem.id, {
      tags: mem.tags,
      ownerPeerId: mem.ownerPeerId,
      createdAt: mem.createdAt,
      personIds: [],
    });
    const out = await repo.listMemoriesInFolder(folderId, indexes);
    expect(out.map((m) => m.id)).toEqual([mem.id]);
    // Meta side-index was populated for the public hit.
    const meta = await indexes.metaForMemories([mem.id]);
    expect(meta.get(mem.id)?.ownerPeerId).toBe(mem.ownerPeerId);
  });

  // The union: a public (autobee, indexed) hit and a private (FolderLocal) hit
  // in the same folder both come back. Private memories are NOT in the folder
  // index — they are read from FolderLocal — so runIngest must index only the
  // public one.
  it("unions public indexed hits with private FolderLocal hits", async () => {
    const { view, append } = makeBackend();
    const folderId = newUlid();
    const publicMem = makeMemory(folderId);
    const privateMem = makeMemory(folderId);
    const folderLocal = {
      listPrivateMemoriesByFolder: async (fid: string) =>
        fid === folderId ? [privateMem] : [],
    } as never;
    const repo = new Repo({ view, append, ownerPeerId: "a".repeat(64), folderLocal });
    const indexes = new Indexes({ view, append });
    await repo.putMemoryByVisibility(publicMem, "public");
    await indexes.indexFolderMembership(folderId, publicMem.id);
    const out = await repo.listMemoriesInFolder(folderId, indexes);
    expect(out.map((m) => m.id).sort()).toEqual([publicMem.id, privateMem.id].sort());
  });
});
