/**
 * Folder-scoped retrieval primitives (the data layer search relies on).
 *
 * This is intentionally a SYNC-layer test, not a full federated search test:
 * `search.probe` lives in @vault/app (depends on the embedding workspace +
 * ModelPool) and is already unit-tested with mocks in Task 17's
 * search-folder.test.ts. @vault/sync cannot import @vault/app, so here we
 * verify what the sync layer guarantees search:
 *   1. Repo.listMemoriesInFolder scopes strictly by folderId.
 *   2. Visibility routing keeps a folder's view complete for the owner —
 *      it unions PUBLIC (autobee) + PRIVATE (FolderLocal) memories.
 *
 * The Playwright E2E (Task 26) covers the real end-to-end
 * search-inside-a-folder flow across two peers.
 */
import { describe, expect, it, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { openAutobeeStore } from "../src/store.js";
import { signCanonical } from "../src/sign.js";
import { FolderLocal } from "../src/folder-local.js";
import { Repo } from "../src/repo.js";
import { newUlid } from "@vault/domain";

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs) await fs.rm(d, { recursive: true, force: true });
  dirs.length = 0;
});
async function tmp(prefix: string): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  dirs.push(d);
  return d;
}
const now = "2026-05-26T10:00:00.000Z";

function memFixture(ownerPeerId: string, folderId: string, summary: string) {
  return {
    id: newUlid(), createdAt: now, updatedAt: now, ownerPeerId,
    provenance: { kind: "extraction" as const }, summary, body: summary,
    sourceRecordId: newUlid(), confidence: 0.5, tags: [] as string[],
    requestableScopes: ["metadata", "snippet", "file"] as Array<"metadata" | "snippet" | "file">,
    folderId,
  };
}

describe("folder-scoped retrieval (search primitives)", () => {
  it("listMemoriesInFolder returns only that folder's memories", async () => {
    const adminDir = await tmp("vault-fs-admin-");
    const flDir = await tmp("vault-fs-fl-");
    const store = await openAutobeeStore({ rootDir: adminDir, founderPeerId: "f".repeat(64), role: "admin" });
    const founderPeerId = store.localPeerId;
    // bootstrap member
    const fm = { id: newUlid(), kind: "member" as const, peerId: founderPeerId, displayName: "Sarah", role: "admin" as const, admittedBy: founderPeerId, admittedAt: now, publicKey: founderPeerId };
    await store.append({ kind: "member", key: `member/${founderPeerId}`, value: { ...fm, sig: signCanonical(fm, store.secretKey) } });
    await store.flush();

    const fl = new FolderLocal(flDir);
    await fl.ready();
    const repo = new Repo({ view: store.view, append: store.append, ownerPeerId: founderPeerId, folderLocal: fl });

    const folderA = newUlid();
    const folderB = newUlid();
    await repo.putMemoryByVisibility(memFixture(founderPeerId, folderA, "alpha-in-A"), "public");
    await repo.putMemoryByVisibility(memFixture(founderPeerId, folderA, "beta-in-A"), "public");
    await repo.putMemoryByVisibility(memFixture(founderPeerId, folderB, "gamma-in-B"), "public");
    await store.flush();

    const inA = await repo.listMemoriesInFolder(folderA);
    const inB = await repo.listMemoriesInFolder(folderB);
    expect(inA.map((m) => m.summary).sort()).toEqual(["alpha-in-A", "beta-in-A"]);
    expect(inB.map((m) => m.summary)).toEqual(["gamma-in-B"]);

    await fl.close();
    await store.close();
  });

  it("listMemoriesInFolder unions public (autobee) + private (FolderLocal) for one folder", async () => {
    const adminDir = await tmp("vault-fs2-admin-");
    const flDir = await tmp("vault-fs2-fl-");
    const store = await openAutobeeStore({ rootDir: adminDir, founderPeerId: "f".repeat(64), role: "admin" });
    const founderPeerId = store.localPeerId;
    const fm = { id: newUlid(), kind: "member" as const, peerId: founderPeerId, displayName: "Sarah", role: "admin" as const, admittedBy: founderPeerId, admittedAt: now, publicKey: founderPeerId };
    await store.append({ kind: "member", key: `member/${founderPeerId}`, value: { ...fm, sig: signCanonical(fm, store.secretKey) } });
    await store.flush();
    const fl = new FolderLocal(flDir);
    await fl.ready();
    const repo = new Repo({ view: store.view, append: store.append, ownerPeerId: founderPeerId, folderLocal: fl });

    // Same folderId, one public memory + one private memory:
    const folderId = newUlid();
    await repo.putMemoryByVisibility(memFixture(founderPeerId, folderId, "public-mem"), "public");
    await repo.putMemoryByVisibility(memFixture(founderPeerId, folderId, "private-mem"), "private");
    await store.flush();

    const all = await repo.listMemoriesInFolder(folderId);
    expect(all.map((m) => m.summary).sort()).toEqual(["private-mem", "public-mem"]);

    await fl.close();
    await store.close();
  });
});
