import { describe, it, expect } from "vitest";
import { Repo, Indexes } from "@vault/sync";
import { newUlid } from "@vault/domain";
import { makeRouter, type BridgeDeps, type Conn } from "../src/ws-bridge.js";

// Shared in-memory Map store (mirrors packages/sync/tests/repo-folder.test.ts) so
// the entity.* / relationship.* handlers exercise REAL Repo + Indexes reads.
function makeBackend() {
  const store = new Map<string, unknown>();
  const view = {
    async get(key: string) {
      return store.has(key) ? { value: store.get(key) } : null;
    },
    async *createReadStream({ gte, lt }: { gte?: string; lt?: string }) {
      for (const key of [...store.keys()].sort()) {
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
  return { view, append, store };
}

const T = "2026-05-27T00:00:00.000Z";
const OWNER = "a".repeat(64);

function makePerson(displayName: string) {
  return {
    id: newUlid(),
    createdAt: T,
    updatedAt: T,
    ownerPeerId: OWNER,
    provenance: { kind: "user" as const },
    displayName,
    aliases: [],
  };
}

// A no-op connection — these read handlers reply via the router's return value,
// not conn.send.
const noopConn: Conn = { send() {} };

/** Build a minimal BridgeDeps with real Repo + Indexes over one Map store and a
 *  truthy runtime.state so requireVaultActive passes. */
function makeDeps() {
  const { view, append } = makeBackend();
  const repo = new Repo({ view, append, ownerPeerId: OWNER });
  const indexes = new Indexes({ view, append });
  const deps = {
    runtime: { state: { selfPeerId: OWNER } },
    getRepo: () => repo,
    getIndexes: () => indexes,
  } as unknown as BridgeDeps;
  return { deps, repo, indexes };
}

describe("entity.* / relationship.* WS read paths", () => {
  it("entity.list person returns the seeded person", async () => {
    const { deps, repo } = makeDeps();
    const person = makePerson("Sarah");
    await repo.putPerson(person);

    const router = makeRouter(deps);
    const reply = await router(
      { kind: "entity.list", entityKind: "person" },
      noopConn
    );

    expect(reply.kind).toBe("entity.results");
    if (reply.kind !== "entity.results") throw new Error("wrong kind");
    expect(reply.entityKind).toBe("person");
    expect(reply.items.map((p) => p.id)).toContain(person.id);
    expect(reply.items.find((p) => p.id === person.id)?.displayName).toBe(
      "Sarah"
    );
  });

  it("relationship.list direction=from includes the mentions edge", async () => {
    const { deps, repo, indexes } = makeDeps();
    const person = makePerson("Marcus");
    await repo.putPerson(person);
    const memId = newUlid();
    const relId = newUlid();
    await indexes.indexRelationship(relId, memId, person.id, "mentions");

    const router = makeRouter(deps);
    const reply = await router(
      { kind: "relationship.list", recordId: memId, direction: "from" },
      noopConn
    );

    expect(reply.kind).toBe("relationship.results");
    if (reply.kind !== "relationship.results") throw new Error("wrong kind");
    expect(reply.recordId).toBe(memId);
    expect(reply.from).toEqual([
      { relId, toId: person.id, type: "mentions" },
    ]);
    expect(reply.to).toEqual([]);
  });

  it("relationship.list default direction returns both from + to", async () => {
    const { deps, indexes } = makeDeps();
    const memId = newUlid();
    const personId = newUlid();
    const relId = newUlid();
    await indexes.indexRelationship(relId, memId, personId, "mentions");

    const router = makeRouter(deps);
    const reply = await router(
      { kind: "relationship.list", recordId: personId },
      noopConn
    );
    expect(reply.kind).toBe("relationship.results");
    if (reply.kind !== "relationship.results") throw new Error("wrong kind");
    // personId is the `to` side of the edge, so it shows up under `to`.
    expect(reply.to).toEqual([{ relId, fromId: memId, type: "mentions" }]);
    expect(reply.from).toEqual([]);
  });

  it("entity.get returns the record plus its inbound + outbound edges", async () => {
    const { deps, repo, indexes } = makeDeps();
    const person = makePerson("Aria");
    await repo.putPerson(person);
    const memId = newUlid();
    const relId = newUlid();
    await indexes.indexRelationship(relId, memId, person.id, "mentions");

    const router = makeRouter(deps);
    const reply = await router(
      { kind: "entity.get", entityKind: "person", id: person.id },
      noopConn
    );

    expect(reply.kind).toBe("entity.detail");
    if (reply.kind !== "entity.detail") throw new Error("wrong kind");
    expect(reply.record?.id).toBe(person.id);
    expect(reply.to).toEqual([{ relId, fromId: memId, type: "mentions" }]);
    expect(reply.from).toEqual([]);
  });
});
