import { describe, it, expect, vi, beforeEach } from "vitest";
const ingested: string[] = [];
vi.mock("@qvac/sdk", () => ({
  ragIngest: vi.fn(async ({ documents }: { documents: string[] }) => {
    ingested.push(...documents);
    return { processed: documents.map(() => ({ status: "fulfilled" })), droppedIndices: [] };
  }),
  ragReindex: vi.fn(),
}));
import { migrateWorkspace } from "../src/reindex.js";

describe("migrateWorkspace", () => {
  beforeEach(() => { ingested.length = 0; });
  it("ingests all memories into the new workspace", async () => {
    async function* mems() {
      yield { memoryId: "M1" as never, body: "a", tags: [] };
      yield { memoryId: "M2" as never, body: "b", tags: [] };
    }
    const result = await migrateWorkspace({
      oldWorkspace: "old", newWorkspace: "new",
      modelId: "embed-model", memories: mems,
    });
    expect(result).toBe("new");
    expect(ingested.length).toBe(2);
  });
});
