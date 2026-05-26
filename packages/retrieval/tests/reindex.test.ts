import { describe, expect, it, beforeEach, vi } from "vitest";
import { reindexAll, migrateWorkspace } from "../src/reindex.js";

// Real SDK contract:
//   ragReindex({ workspace }) → { reindexed: boolean, details?: { reason? } }
vi.mock("@qvac/sdk", () => ({
  ragReindex: vi.fn(async () => ({ reindexed: true })),
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

  it("throws — atomic-swap migration is deferred to Plan 3", async () => {
    await expect(
      migrateWorkspace({
        oldWorkspace: "vault-abc-v1",
        newWorkspace: "vault-abc-v2",
        memories: async function* () {
          // no-op
        },
      })
    ).rejects.toThrow(/not implemented in Plan 1/);
  });
});
