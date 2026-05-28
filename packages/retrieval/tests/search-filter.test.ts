import { describe, it, expect, vi } from "vitest";

vi.mock("@qvac/sdk", () => ({
  ragSearch: vi.fn(async () => [
    { id: "MEM1", content: "x", score: 0.9 },
    { id: "MEM2", content: "y", score: 0.8 },
  ]),
}));

import { search } from "../src/search.js";

describe("metadata filtering", () => {
  it("excludes hits whose side-index metadata does not match", async () => {
    const metaLookup = async (ids: readonly string[]) => {
      const m = new Map<string, Record<string, string>>();
      if (ids.includes("MEM1")) m.set("MEM1", { tags: "keep", ownerPeerId: "P", createdAt: "2026-05-27T00:00:00.000Z", personIds: "" });
      if (ids.includes("MEM2")) m.set("MEM2", { tags: "other", ownerPeerId: "P", createdAt: "2026-05-27T00:00:00.000Z", personIds: "" });
      return m;
    };
    const hits = await search({
      workspace: "w", modelId: "m", query: "q", k: 10,
      filters: { tags: ["keep"] },
      metaLookup,
    });
    expect(hits.map((h) => h.memoryId)).toEqual(["MEM1"]);
  });
});
