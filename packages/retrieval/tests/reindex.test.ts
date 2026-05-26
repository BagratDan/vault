import { describe, expect, it, beforeEach, vi } from "vitest";
import { reindexAll, migrateWorkspace } from "../src/reindex.js";

vi.mock("@qvac/sdk", () => ({
  ragReindex: vi.fn(async (opts: { workspace: string }) => ({
    workspace: opts.workspace,
    reindexed: 42,
  })),
  ragIngest: vi.fn(async () => ({ id: "x" })),
  ragCloseWorkspace: vi.fn(async () => undefined),
  ragDeleteWorkspace: vi.fn(async () => undefined),
}));

describe("reindexAll", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls ragReindex with the given workspace and returns the count", async () => {
    const out = await reindexAll("vault-abc123");
    expect(out.reindexed).toBe(42);
    const { ragReindex } = await import("@qvac/sdk");
    expect(ragReindex).toHaveBeenCalledWith({ workspace: "vault-abc123" });
  });
});

describe("migrateWorkspace", () => {
  beforeEach(() => vi.clearAllMocks());

  it("copies all memories into the new workspace, then closes the old", async () => {
    const memories = [
      { memoryId: "m1" as never, body: "hello", tags: ["greeting"] },
      { memoryId: "m2" as never, body: "world", tags: [] },
    ];
    const newName = await migrateWorkspace({
      oldWorkspace: "vault-abc-v1",
      newWorkspace: "vault-abc-v2",
      memories: async function* () {
        for (const m of memories) yield m;
      },
    });
    expect(newName).toBe("vault-abc-v2");
    const { ragIngest, ragCloseWorkspace } = await import("@qvac/sdk");
    expect(ragIngest).toHaveBeenCalledTimes(2);
    expect(ragCloseWorkspace).toHaveBeenCalledWith({ workspace: "vault-abc-v1" });
  });
});
