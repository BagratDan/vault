import { describe, expect, it, vi } from "vitest";

const callOrder: string[] = [];

vi.mock("../src/chunk-embed.js", () => ({
  chunkAndEmbed: vi.fn(async () => {
    callOrder.push("embed");
    return { chunks: 2, embedded: 2, errors: 0 };
  }),
}));

import { reindexAllMemories } from "../src/routes/reindex.js";

function mem(id: string) {
  return { id, body: "b", tags: [], createdAt: "2026-05-27T10:00:00.000Z" } as never;
}

describe("reindexAllMemories", () => {
  it("wipes the workspace once before re-embedding, covers public + private", async () => {
    callOrder.length = 0;
    const reset = vi.fn(async () => { callOrder.push("reset"); });
    const workspace = { reset, ingest: vi.fn(), getName: () => "ws" } as never;
    const getRepo = () => ({ listMemories: async () => [mem("01J0PUB00000000000000000A"), mem("01J0PUB00000000000000000B")] } as never);
    const getFolderLocal = () => ({ listAllPrivateMemories: async () => [mem("01J0PRV00000000000000000C")] } as never);

    const r = await reindexAllMemories({
      pool: {} as never, workspace, ownerPeerId: "a".repeat(64), getRepo, getFolderLocal,
    });

    expect(r).toEqual({ memories: 3, embedded: 6, errors: 0 });
    expect(reset).toHaveBeenCalledTimes(1);
    // reset must happen before any embed
    expect(callOrder[0]).toBe("reset");
    expect(callOrder.filter((x) => x === "embed")).toHaveLength(3);
  });

  it("handles a null folder-local (public-only)", async () => {
    callOrder.length = 0;
    const reset = vi.fn(async () => { callOrder.push("reset"); });
    const workspace = { reset, ingest: vi.fn(), getName: () => "ws" } as never;
    const getRepo = () => ({ listMemories: async () => [mem("01J0PUB00000000000000000A")] } as never);
    const r = await reindexAllMemories({
      pool: {} as never, workspace, ownerPeerId: "a".repeat(64), getRepo, getFolderLocal: () => null,
    });
    expect(r.memories).toBe(1);
  });
});
