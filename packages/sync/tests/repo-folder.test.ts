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

describe("listMemoriesInFolder via folder index", () => {
  it("returns only memories indexed under the folder", async () => {
    const { view, append } = makeBackend();
    const repo = new Repo({ view, append, ownerPeerId: "a".repeat(64) });
    const indexes = new Indexes({ view, append });
    const folderId = newUlid();
    const t = "2026-05-27T00:00:00.000Z";
    const mem = {
      id: newUlid(), createdAt: t, updatedAt: t, ownerPeerId: "a".repeat(64),
      provenance: { kind: "user" as const }, summary: "s", body: "b",
      sourceRecordId: newUlid(), confidence: 1, tags: [],
      requestableScopes: ["snippet" as const], folderId,
    };
    await repo.putMemory(mem);
    await indexes.indexFolderMembership(folderId, mem.id);
    const out = await repo.listMemoriesInFolder(folderId, indexes);
    expect(out.map((m) => m.id)).toEqual([mem.id]);
  });
});
