import { describe, expect, it, vi } from "vitest";
import { folderAdd, folderUpdate } from "../src/routes/folder.js";

const HEX_64 = "a".repeat(64);

function makeDeps(): Parameters<typeof folderAdd>[0] {
  const folders: Array<{ id: string; ownerPeerId: string; path: string; deletedAt?: string }> = [];
  return {
    fs: { resolveSafeAbsolute: async (p: string) => p } as never,
    folderLocal: {
      listFolders: async () => folders as never,
      putFolder: async (f: { id: string; ownerPeerId: string; path: string }) => {
        folders.push(f);
      },
      getFolder: async (id: string) => folders.find((x) => x.id === id) ?? null,
      listPrivateMemoriesByFolder: async () => [],
    } as never,
    getRepo: () =>
      ({
        putFolderPublic: vi.fn(async () => undefined),
        listFoldersPublic: async () => [],
        listMemoriesInFolder: async () => [],
        markMemoryDeleted: async () => undefined,
      }) as never,
    getIndexes: () =>
      ({
        memoryIdsForFolder: async () => [],
      }) as never,
    pool: {} as never,
    ownerPeerId: HEX_64,
    storeSecretKey: new Uint8Array(64),
    broadcast: () => undefined,
    workspace: { getName: () => "ws", ingest: async () => undefined } as never,
    flushStore: async () => undefined,
  };
}

describe("folderAdd", () => {
  it("rejects a path that is not a directory", async () => {
    const deps = makeDeps();
    await expect(
      folderAdd(deps, { path: "/nonexistent/path/xyz", displayName: "x", visibility: "public" })
    ).rejects.toThrow(/folder-not-readable/);
  });
});

describe("folderUpdate", () => {
  it("refuses update from a non-owner", async () => {
    const deps = makeDeps();
    await deps.folderLocal.putFolder({
      id: "01J0ABCDEFGHJKMNPQRSTV0001",
      createdAt: "2026-05-26T10:00:00.000Z",
      updatedAt: "2026-05-26T10:00:00.000Z",
      ownerPeerId: "b".repeat(64),
      provenance: { kind: "user" },
      kind: "folder",
      path: "/x",
      displayName: "x",
      visibility: "public",
    } as never);
    await expect(
      folderUpdate(deps, { folderId: "01J0ABCDEFGHJKMNPQRSTV0001", visibility: "private" })
    ).rejects.toThrow(/folder-not-owner/);
  });
});
