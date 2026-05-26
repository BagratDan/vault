import { describe, expect, it, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { openAutobeeStore } from "../src/store.js";
import { Repo } from "../src/repo.js";
import { Indexes } from "../src/indexes.js";
import { signCanonical } from "../src/sign.js";
import { newUlid } from "@vault/domain";

describe("Repo + Indexes over Autobee", () => {
  let dir: string;
  let opened: Awaited<ReturnType<typeof openAutobeeStore>>;
  let repo: Repo;
  let indexes: Indexes;
  let founderPeerId: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vault-repo-auto-"));
    opened = await openAutobeeStore({
      rootDir: dir,
      role: "admin",
    });
    // Use the actual local peer identity (autobee's signing key)
    founderPeerId = opened.localPeerId;

    // Bootstrap founder Member so content writes pass the roster gate
    const founderMember = {
      id: newUlid(),
      kind: "member" as const,
      peerId: founderPeerId,
      displayName: "Founder",
      role: "admin" as const,
      admittedBy: founderPeerId,
      admittedAt: "2026-05-26T10:00:00.000Z",
      publicKey: founderPeerId,
    };
    await opened.append({
      kind: "member",
      key: `member/${founderPeerId}`,
      value: {
        ...founderMember,
        sig: signCanonical(founderMember, opened.secretKey),
      },
    });
    await opened.flush();
    repo = new Repo({
      view: opened.view,
      append: opened.append,
      ownerPeerId: founderPeerId,
    });
    indexes = new Indexes({
      view: opened.view,
      append: opened.append,
    });
  });

  afterEach(async () => {
    await opened.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("putMemory + getMemory roundtrip", async () => {
    const mem = {
      id: newUlid(),
      createdAt: "2026-05-26T10:00:00.000Z",
      updatedAt: "2026-05-26T10:00:00.000Z",
      ownerPeerId: founderPeerId,
      provenance: { kind: "user" as const },
      summary: "hi",
      body: "hi",
      sourceRecordId: newUlid(),
      confidence: 0.9,
      tags: ["t"],
      requestableScopes: ["snippet" as const],
      folderId: "01J0CAPTVRES000000000000AA",
    };
    await repo.putMemory(mem);
    await opened.flush();
    const got = await repo.getMemory(mem.id);
    expect(got).toEqual(mem);
  });

  it("listMemories returns all memories ordered by ULID", async () => {
    const base = {
      createdAt: "2026-05-26T10:00:00.000Z",
      updatedAt: "2026-05-26T10:00:00.000Z",
      ownerPeerId: founderPeerId,
      provenance: { kind: "user" as const },
      sourceRecordId: newUlid(),
      confidence: 0.5,
      tags: [],
      requestableScopes: [],
      folderId: "01J0CAPTVRES000000000000AA",
    };
    const m1 = { ...base, id: newUlid(), summary: "a", body: "a" };
    const m2 = { ...base, id: newUlid(), summary: "b", body: "b" };
    await repo.putMemory(m1);
    await repo.putMemory(m2);
    await opened.flush();
    const all = await repo.listMemories();
    expect(all).toHaveLength(2);
  });

  it("indexTags writes idx/tag/<tag>/<memId> entries", async () => {
    await indexes.indexTags("mem-1", ["auth", "migration"]);
    await opened.flush();
    expect(await indexes.memoryIdsForTag("auth")).toEqual(["mem-1"]);
    expect(await indexes.memoryIdsForTag("migration")).toEqual(["mem-1"]);
  });

  it("indexPersons accumulates multiple memories under one person", async () => {
    await indexes.indexPersons("mem-1", ["pid-sarah"]);
    await indexes.indexPersons("mem-2", ["pid-sarah"]);
    await opened.flush();
    const ids = await indexes.memoryIdsForPerson("pid-sarah");
    expect(new Set(ids)).toEqual(new Set(["mem-1", "mem-2"]));
  });
});
