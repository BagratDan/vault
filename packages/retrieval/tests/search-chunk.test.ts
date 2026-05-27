import { describe, expect, it, vi } from "vitest";

// Chunk hits come back keyed `<memoryId>#<chunkIndex>`. search() must collapse
// them to one result per parent memory, keeping the highest-scoring chunk.
vi.mock("@qvac/sdk", () => ({
  ragSearch: vi.fn(async () => [
    { id: "01J0AAA000000000000000000A#0", content: "chunk zero of A", score: 0.6 },
    { id: "01J0AAA000000000000000000A#1", content: "chunk one of A — best", score: 0.9 },
    { id: "01J0BBB000000000000000000B#0", content: "chunk zero of B", score: 0.7 },
    { id: "01J0CCC000000000000000000C", content: "legacy unchunked C", score: 0.5 },
  ]),
}));

import { search } from "../src/search.js";

describe("search — chunk dedupe to best per parent", () => {
  it("returns one hit per parent memoryId, keeping the top chunk", async () => {
    const hits = await search({ workspace: "ws", modelId: "m", query: "q", k: 8 });
    const byId = new Map(hits.map((h) => [h.memoryId, h]));
    // Three distinct parents: A, B, C.
    expect(hits).toHaveLength(3);
    // A collapses to its chunk#1 (score 0.9), snippet = that chunk's content.
    expect(byId.get("01J0AAA000000000000000000A")?.score).toBeCloseTo(0.9);
    expect(byId.get("01J0AAA000000000000000000A")?.snippet).toBe("chunk one of A — best");
    // Legacy un-chunked id has no '#' → parent is the id itself.
    expect(byId.get("01J0CCC000000000000000000C")?.snippet).toBe("legacy unchunked C");
    // Results sorted by score desc.
    expect(hits[0]!.score).toBeGreaterThanOrEqual(hits[1]!.score);
  });
});
