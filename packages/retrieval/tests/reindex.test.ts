import { describe, expect, it, beforeEach, vi } from "vitest";
import { reindexAll, migrateWorkspace } from "../src/reindex.js";

// Real SDK contract:
//   ragReindex({ workspace }) → { reindexed: boolean, details?: { reason? } }
//   ragIngest({ workspace, modelId, documents, chunk }) → { processed: [...], droppedIndices: [] }
vi.mock("@qvac/sdk", () => ({
  ragReindex: vi.fn(async () => ({ reindexed: true })),
  ragIngest: vi.fn(async ({ documents }: { documents: string[] }) => ({
    processed: documents.map(() => ({ status: "fulfilled" })),
    droppedIndices: [],
  })),
  ragSaveEmbeddings: vi.fn(async () => []),
  ragCloseWorkspace: vi.fn(async () => undefined),
  ragDeleteWorkspace: vi.fn(async () => undefined),
}));

describe("reindexAll", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls ragReindex with the given workspace and returns the boolean", async () => {
    const out = await reindexAll("vault-abc123");
    expect(out.reindexed).toBe(true);
    const { ragReindex } = await import("@qvac/sdk");
    expect(ragReindex).toHaveBeenCalledWith({ workspace: "vault-abc123" });
  });

  it("surfaces details.reason when reindex was skipped", async () => {
    const { ragReindex } = await import("@qvac/sdk");
    (ragReindex as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      reindexed: false,
      details: { reason: "not enough documents" },
    });
    const out = await reindexAll("vault-abc123");
    expect(out.reindexed).toBe(false);
    expect(out.reason).toBe("not enough documents");
  });
});

describe("migrateWorkspace", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the new workspace name after re-ingesting all memories", async () => {
    const result = await migrateWorkspace({
      oldWorkspace: "vault-abc-v1",
      newWorkspace: "vault-abc-v2",
      modelId: "embed-model",
      memories: async function* () {
        yield { memoryId: "01J0CAPTVRES000000000000AA" as never, body: "doc1", tags: [] };
        yield { memoryId: "01J0CAPTVRES000000000000AB" as never, body: "doc2", tags: [] };
      },
    });
    expect(result).toBe("vault-abc-v2");
    const { ragIngest } = await import("@qvac/sdk");
    expect(ragIngest).toHaveBeenCalledTimes(2);
  });
});
