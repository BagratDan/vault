import { describe, expect, it, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { openStore } from "../src/store.js";
import { Repo } from "../src/repo.js";
import { newUlid } from "@vault/domain";

describe("Repo", () => {
  let dir: string;
  let close: () => Promise<void>;
  let repo: Repo;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vault-repo-"));
    const opened = await openStore(dir);
    close = opened.close;
    repo = new Repo(opened.bee);
  });

  afterEach(async () => {
    await close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  const base = (id = newUlid()) => ({
    id,
    createdAt: "2026-05-26T10:00:00.000Z",
    updatedAt: "2026-05-26T10:00:00.000Z",
    ownerPeerId: "a".repeat(64),
    provenance: { kind: "user" as const },
  });

  it("put + get round-trips a Memory", async () => {
    const id = newUlid();
    const mem = {
      ...base(id),
      summary: "hi",
      body: "hi",
      sourceRecordId: newUlid(),
      confidence: 0.9,
      tags: ["t"],
      requestableScopes: ["snippet" as const],
    };
    await repo.putMemory(mem);
    const got = await repo.getMemory(id);
    expect(got).toEqual(mem);
  });

  it("list with prefix returns only memories", async () => {
    const m1 = {
      ...base(),
      summary: "a",
      body: "a",
      sourceRecordId: newUlid(),
      confidence: 0.5,
      tags: [],
      requestableScopes: [],
    };
    const p1 = { ...base(), displayName: "Sarah", aliases: [] };
    await repo.putMemory(m1);
    await repo.putPerson(p1);
    const mems = await repo.listMemories();
    expect(mems).toHaveLength(1);
    expect(mems[0]!.id).toBe(m1.id);
  });

  it("returns null for a missing key", async () => {
    expect(await repo.getMemory("01J0".padEnd(26, "Z") as never)).toBeNull();
  });
});
