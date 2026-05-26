import { describe, expect, it, vi } from "vitest";

vi.mock("@vault/ai", async () => ({
  ensureEmbedModel: async () => "embed-mock",
  blurPreview: (s: string) => {
    if (!s) return "";
    const i = s.search(/\s/);
    if (i === -1) return s;
    return s.slice(0, i) + s.slice(i).replace(/[A-Za-z0-9]/g, "•");
  },
}));

vi.mock("@vault/retrieval", async () => ({
  search: async () => [
    {
      memoryId: "01J0ABCDEFGHJKMNPQRSTV0001",
      score: 0.91,
      snippet: "indemnification clause from Acme MSA 2025",
      tags: ["commitment", "migration"],
    },
  ],
}));

import { handleSearchProbe } from "../src/routes/search.js";

describe("handleSearchProbe", () => {
  it("blurs snippets and stamps ownerPeerId", async () => {
    const reply = await handleSearchProbe(
      {
        pool: {} as never,
        workspace: { getName: () => "ws" } as never,
        selfPeerId: "a".repeat(64),
      },
      {
        v: 1,
        requestId: "01J0AAAAAAAAAAAAAAAAAAAAAA",
        query: "indemnification",
        k: 5,
      }
    );
    expect(reply.hits).toHaveLength(1);
    const hit = reply.hits[0]!;
    expect(hit.ownerPeerId).toBe("a".repeat(64));
    expect(hit.snippet.startsWith("indemnification")).toBe(true);
    const tail = hit.snippet.slice(hit.snippet.indexOf(" ") + 1);
    expect(/[A-Za-z0-9]/.test(tail)).toBe(false);
    expect(hit.snippet).toContain("•");
  });
});
