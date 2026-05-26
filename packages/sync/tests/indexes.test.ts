import { describe, expect, it, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { openStore } from "../src/store.js";
import { Indexes } from "../src/indexes.js";

describe("Indexes", () => {
  let dir: string;
  let close: () => Promise<void>;
  let idx: Indexes;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vault-idx-"));
    const opened = await openStore(dir);
    close = opened.close;
    idx = new Indexes(opened.bee);
  });

  afterEach(async () => {
    await close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("indexTags writes idx/tag/<tag>/<memId> entries", async () => {
    await idx.indexTags("mem-1", ["auth", "migration"]);
    expect(await idx.memoryIdsForTag("auth")).toEqual(["mem-1"]);
    expect(await idx.memoryIdsForTag("migration")).toEqual(["mem-1"]);
  });

  it("indexPersons writes idx/person/<personId>/<memId> entries", async () => {
    await idx.indexPersons("mem-1", ["pid-sarah"]);
    expect(await idx.memoryIdsForPerson("pid-sarah")).toEqual(["mem-1"]);
  });

  it("multiple memories accumulate under one tag", async () => {
    await idx.indexTags("mem-1", ["auth"]);
    await idx.indexTags("mem-2", ["auth"]);
    const ids = await idx.memoryIdsForTag("auth");
    expect(new Set(ids)).toEqual(new Set(["mem-1", "mem-2"]));
  });
});
