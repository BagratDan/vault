import { describe, expect, it, beforeEach, vi } from "vitest";
import { search, type SearchInput } from "../src/search.js";

// Real SDK contract:
//   ragSearch({ modelId, workspace, query, topK }) → SearchResult[]
//   where SearchResult is { id, content, score } — NO metadata.
vi.mock("@qvac/sdk", () => ({
  ragSearch: vi.fn(async (opts: { topK?: number }) =>
    [
      { id: "mem-a", score: 0.91, content: "Sarah promised to ship the migration by Friday." },
      { id: "mem-b", score: 0.74, content: "Marcus mentioned the migration in passing." },
      { id: "mem-c", score: 0.65, content: "Daily standup notes from Tuesday." },
    ].slice(0, opts.topK ?? 5)
  ),
}));

describe("search", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns hits sorted by score descending, keyed by memoryId (= rag id)", async () => {
    const input: SearchInput = {
      modelId: "emb",
      workspace: "ws",
      query: "migration",
      k: 8,
    };
    const out = await search(input);
    expect(out.map((r) => r.memoryId)).toEqual(["mem-a", "mem-b", "mem-c"]);
    expect(out[0]!.snippet).toMatch(/indemnification|Sarah/);
  });

  it("date filter without createdAt metadata excludes hits (documented behavior)", async () => {
    // The SDK doesn't return metadata, so date filters can't match anything.
    // This is a documented limitation — filter.ts treats missing createdAt
    // as 'does not match' when a date filter is set.
    const out = await search({
      modelId: "emb",
      workspace: "ws",
      query: "x",
      k: 8,
      filters: { createdAfter: "2026-05-01T00:00:00.000Z" },
    });
    expect(out).toEqual([]);
  });
});
