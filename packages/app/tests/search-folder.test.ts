import { describe, expect, it, vi } from "vitest";

vi.mock("@vault/ai", () => ({
  ensureEmbedModel: async () => "embed-mock",
  blurPreview: (s: string) => s.split(" ")[0] + " •••",
}));

vi.mock("@vault/retrieval", () => ({
  search: async () => [
    { memoryId: "01J0PUBMEM00000000000000AA", score: 0.9, snippet: "indemnification clause from Acme", tags: [] },
    { memoryId: "01J0PRVMEM00000000000000AA", score: 0.8, snippet: "secret note", tags: [] },
  ],
}));

import { handleSearchProbe } from "../src/routes/search.js";

const PUB_FOLDER = "01J0PUBFLD00000000000000AA";
const PRV_FOLDER = "01J0PRVFLD00000000000000AA";

function makeDeps() {
  const memById: Record<string, { id: string; folderId: string }> = {
    "01J0PUBMEM00000000000000AA": { id: "01J0PUBMEM00000000000000AA", folderId: PUB_FOLDER },
    "01J0PRVMEM00000000000000AA": { id: "01J0PRVMEM00000000000000AA", folderId: PRV_FOLDER },
  };
  return {
    pool: {} as never,
    workspace: { getName: () => "ws" } as never,
    selfPeerId: "a".repeat(64),
    repo: {
      // public memory resolvable in autobee; private memory NOT (returns null)
      getMemory: async (id: string) =>
        id === "01J0PUBMEM00000000000000AA" ? memById[id] : null,
    } as never,
    folderLocal: {
      getPrivateMemory: async (id: string) =>
        id === "01J0PRVMEM00000000000000AA" ? memById[id] : null,
      listFolders: async () => [
        { id: PUB_FOLDER, visibility: "public" },
        { id: PRV_FOLDER, visibility: "private" },
      ],
      getFolder: async (id: string) =>
        id === PUB_FOLDER
          ? { id: PUB_FOLDER, visibility: "public" }
          : { id: PRV_FOLDER, visibility: "private" },
    } as never,
  };
}

describe("handleSearchProbe — folder privacy gate", () => {
  it("drops hits whose folder is private", async () => {
    const reply = await handleSearchProbe(makeDeps(), {
      v: 1, requestId: "01J0REQ0000000000000000AAA", query: "indemnification", k: 5,
    });
    expect(reply.hits).toHaveLength(1);
    expect(reply.hits[0]!.folderId).toBe(PUB_FOLDER);
    // snippet is blurred:
    expect(reply.hits[0]!.snippet).toContain("•");
  });

  it("drops hits not in the requested folderIds", async () => {
    const reply = await handleSearchProbe(makeDeps(), {
      v: 1, requestId: "01J0REQ0000000000000000AAA", query: "x", k: 5,
      folderIds: ["01J0OTHERFLD0000000000000A"],
    });
    expect(reply.hits).toHaveLength(0);
  });

  it("returns the public hit when folderIds includes its folder", async () => {
    const reply = await handleSearchProbe(makeDeps(), {
      v: 1, requestId: "01J0REQ0000000000000000AAA", query: "x", k: 5,
      folderIds: [PUB_FOLDER],
    });
    expect(reply.hits).toHaveLength(1);
    expect(reply.hits[0]!.folderId).toBe(PUB_FOLDER);
  });
});
