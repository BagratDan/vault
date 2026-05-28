/**
 * Two-peer folder visibility (data-layer privacy invariant).
 *
 * Proves the storage-tier half of the two-gate privacy model end-to-end:
 *   - A PUBLIC folder's record + its memories reach the synced Autobee view,
 *     so any peer pulling that view sees them.
 *   - A PRIVATE folder's record + memories NEVER appear in the Autobee view;
 *     they live only in the owner-local FolderLocal Hyperbee.
 *
 * The founder bootstraps its own signed Member record first so apply()'s
 * roster gate admits the subsequent folder/memory writes (see two-peer.test.ts).
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

async function bootstrapAdmin(rootDir: string) {
  const store = await openAutobeeStore({ rootDir, founderPeerId: "f".repeat(64), role: "admin" });
  const founderPeerId = store.localPeerId;
  const founderMember = {
    id: newUlid(),
    kind: "member" as const,
    peerId: founderPeerId,
    displayName: "Sarah",
    role: "admin" as const,
    admittedBy: founderPeerId,
    admittedAt: now,
    publicKey: founderPeerId,
  };
  await store.append({
    kind: "member",
    key: `member/${founderPeerId}`,
    value: { ...founderMember, sig: signCanonical(founderMember, store.secretKey) },
  });
  await store.flush();
  return { store, founderPeerId };
}

function memFixture(ownerPeerId: string, folderId: string) {
  return {
    id: newUlid(),
    createdAt: now,
    updatedAt: now,
    ownerPeerId,
    provenance: { kind: "extraction" as const },
    summary: "x",
    body: "y",
    sourceRecordId: newUlid(),
    confidence: 0.5,
    tags: [] as string[],
    requestableScopes: ["metadata", "snippet", "file"] as Array<"metadata" | "snippet" | "file">,
    folderId,
  };
}

describe("two-peer folder visibility", () => {
  it("public folder + memories reach autobee; private stays local-only", async () => {
    const adminDir = await tmp("vault-folder-admin-");
    const flDir = await tmp("vault-folder-fl-");
    const { store, founderPeerId } = await bootstrapAdmin(adminDir);
    const fl = new FolderLocal(flDir);
    await fl.ready();
    const repo = new Repo({ view: store.view, append: store.append, ownerPeerId: founderPeerId, folderLocal: fl });

    // PUBLIC folder
    const publicId = newUlid();
    const pubBody = {
      id: publicId, createdAt: now, updatedAt: now, ownerPeerId: founderPeerId,
      provenance: { kind: "user" as const }, kind: "folder" as const,
      displayName: "Acme", visibility: "public" as const,
    };
    await fl.putFolder({ ...pubBody, path: "/Users/sarah/Acme" });
    await repo.putFolderPublic({ ...pubBody, sig: signCanonical(pubBody, store.secretKey) });
    const pubMem = memFixture(founderPeerId, publicId);
    await repo.putMemoryByVisibility(pubMem, "public");

    // PRIVATE folder
    const privateId = newUlid();
    await fl.putFolder({
      id: privateId, createdAt: now, updatedAt: now, ownerPeerId: founderPeerId,
      provenance: { kind: "user" }, kind: "folder", path: "/secret",
      displayName: "Secret", visibility: "private",
    });
    const privMem = memFixture(founderPeerId, privateId);
    await repo.putMemoryByVisibility(privMem, "private");

    await store.flush();

    // Public folder record IS in autobee:
    const publicFolders = await repo.listFoldersPublic();
    expect(publicFolders.map((f) => f.id)).toContain(publicId);
    // Private folder record is NOT in autobee:
    expect(publicFolders.map((f) => f.id)).not.toContain(privateId);

    // Public memory IS in autobee (scan the view for its key):
    const seenMemKeys: string[] = [];
    for await (const { key } of store.view.createReadStream({ gte: "mem/", lt: "mem/~" })) {
      seenMemKeys.push(key);
    }
    expect(seenMemKeys.some((k) => k.includes(pubMem.id))).toBe(true);
    // Private memory is NOT in autobee:
    expect(seenMemKeys.some((k) => k.includes(privMem.id))).toBe(false);
    // Private memory IS in FolderLocal:
    const privList = await fl.listPrivateMemoriesByFolder(privateId);
    expect(privList.map((m) => m.id)).toContain(privMem.id);

    await fl.close();
    await store.close();
  });
});
