import { describe, it, expect } from "vitest";
import { Indexes } from "../src/indexes.js";

// In-memory View+append backed by a sorted Map, matching the Hyperbee
// createReadStream(gte/lt) contract the Indexes class depends on.
function makeIndexes() {
  const store = new Map<string, unknown>();
  const view = {
    async *createReadStream({ gte, lt }: { gte?: string; lt?: string }) {
      const keys = [...store.keys()].sort();
      for (const key of keys) {
        if (gte && key < gte) continue;
        if (lt && key >= lt) continue;
        yield { key, value: store.get(key) };
      }
    },
  };
  const append = async (op: unknown) => {
    const o = op as { key: string; value: unknown };
    store.set(o.key, o.value);
  };
  return { indexes: new Indexes({ view, append }), store };
}

describe("edge indexes", () => {
  it("records both directions of a relationship", async () => {
    const { indexes } = makeIndexes();
    await indexes.indexRelationship("REL1", "MEM1", "PERSON1", "mentions");
    const from = await indexes.relationshipsFrom("MEM1");
    const to = await indexes.relationshipsTo("PERSON1");
    expect(from).toEqual([{ relId: "REL1", toId: "PERSON1", type: "mentions" }]);
    expect(to).toEqual([{ relId: "REL1", fromId: "MEM1", type: "mentions" }]);
  });
});

describe("folder index", () => {
  it("lists memory ids for a folder", async () => {
    const { indexes } = makeIndexes();
    await indexes.indexFolderMembership("FOLDER1", "MEM1");
    await indexes.indexFolderMembership("FOLDER1", "MEM2");
    await indexes.indexFolderMembership("FOLDER2", "MEM3");
    expect((await indexes.memoryIdsForFolder("FOLDER1")).sort()).toEqual(["MEM1", "MEM2"]);
    expect(await indexes.memoryIdsForFolder("FOLDER2")).toEqual(["MEM3"]);
  });
});
