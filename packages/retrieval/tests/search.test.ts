import { describe, expect, it, beforeEach, vi } from "vitest";
import { search, type SearchInput } from "../src/search.js";

vi.mock("@qvac/sdk", () => ({
  ragSearch: vi.fn(async (opts: { workspace: string; query: string; limit: number }) => ({
    results: [
      {
        id: "mem-a",
        score: 0.91,
        snippet: "Sarah promised to ship the migration by Friday.",
        metadata: { memoryId: "mem-a", tags: "commitment,migration", ownerPeerId: "p1" },
      },
      {
        id: "mem-b",
        score: 0.74,
        snippet: "Marcus mentioned the migration in passing.",
        metadata: { memoryId: "mem-b", tags: "migration", ownerPeerId: "p1" },
      },
      {
        id: "mem-c",
        score: 0.65,
        snippet: "Daily standup notes from Tuesday.",
        metadata: { memoryId: "mem-c", tags: "standup", ownerPeerId: "p1" },
      },
    ].slice(0, opts.limit),
  })),
}));

describe("search", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns hits sorted by score descending", async () => {
    const input: SearchInput = { workspace: "ws", query: "migration", k: 8 };
    const out = await search(input);
    expect(out.map((r) => r.memoryId)).toEqual(["mem-a", "mem-b", "mem-c"]);
  });

  it("applies a tag filter", async () => {
    const input: SearchInput = {
      workspace: "ws",
      query: "migration",
      k: 8,
      filters: { tags: ["commitment"] },
    };
    const out = await search(input);
    expect(out.map((r) => r.memoryId)).toEqual(["mem-a"]);
  });

  it("applies a date filter via metadata", async () => {
    const { ragSearch } = await import("@qvac/sdk");
    (ragSearch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      results: [
        {
          id: "mem-d",
          score: 0.9,
          snippet: "old",
          metadata: { memoryId: "mem-d", createdAt: "2026-01-01T00:00:00.000Z", tags: "" },
        },
        {
          id: "mem-e",
          score: 0.8,
          snippet: "new",
          metadata: { memoryId: "mem-e", createdAt: "2026-05-26T00:00:00.000Z", tags: "" },
        },
      ],
    });
    const out = await search({
      workspace: "ws",
      query: "x",
      k: 8,
      filters: { createdAfter: "2026-05-01T00:00:00.000Z" },
    });
    expect(out.map((r) => r.memoryId)).toEqual(["mem-e"]);
  });
});
