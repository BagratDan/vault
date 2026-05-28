import { describe, it, expect, vi } from "vitest";
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
    sourceRecordId: newUlid(), confidence: 1, tags: ["work"],
    requestableScopes: ["snippet" as const], folderId,
    ...overrides,
  };
}

describe("Repo.backfillIndexes", () => {
  it("populates folder + meta indexes for an existing un-indexed memory", async () => {
    const { view, append } = makeBackend();
    const repo = new Repo({ view, append, ownerPeerId: "a".repeat(64) });
    const indexes = new Indexes({ view, append });
    const folderId = newUlid();
    const mem = makeMemory(folderId);
    // Seed WITHOUT writing any index.
    await repo.putMemory(mem);

    await repo.backfillIndexes(indexes);
    expect(await indexes.memoryIdsForFolder(mem.folderId)).toContain(mem.id);
    expect((await indexes.metaForMemories([mem.id])).has(mem.id)).toBe(true);

    // idempotent: second run doesn't duplicate / doesn't throw, and the
    // sentinel makes it an O(1) fast path that never re-scans memories.
    const listSpy = vi.spyOn(repo, "listMemories");
    await repo.backfillIndexes(indexes);
    expect(listSpy).not.toHaveBeenCalled(); // sentinel short-circuited the scan
    expect(
      (await indexes.memoryIdsForFolder(mem.folderId)).filter((x) => x === mem.id).length
    ).toBe(1);
  });
});
