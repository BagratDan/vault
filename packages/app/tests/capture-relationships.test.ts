import { describe, expect, it, vi } from "vitest";
import { newUlid } from "@vault/domain";

// Mock @vault/ai so `extractFromText` returns a fixed extraction (one person,
// one task) without touching a real model. ensureEmbedModel/embedText exist so
// the dedup path in captureText is harmless (the dedup search is mocked to []).
// This mirrors the mocking style of search-folder.test.ts.
const CAPTURES_FOLDER = newUlid();
const OWNER = "a".repeat(64);

const personId = newUlid();
const taskId = newUlid();
let extractMemoryId = "";
let extractSourceRecordId = "";

vi.mock("@vault/ai", () => {
  const t = "2026-05-27T10:00:00.000Z";
  return {
    ensureEmbedModel: vi.fn(async () => "embed-model-id"),
    embedText: vi.fn(async () => new Array(8).fill(0.1)),
    extractFromText: vi.fn(
      async (_pool: unknown, input: { sourceRecordId: string; folderId: string }) => {
        extractSourceRecordId = input.sourceRecordId;
        const memory = {
          id: newUlid(),
          createdAt: t,
          updatedAt: t,
          ownerPeerId: OWNER,
          provenance: { kind: "extraction" as const },
          summary: "Met Jane about the draft",
          body: "Met Jane Doe; need to send the draft.",
          sourceRecordId: input.sourceRecordId,
          confidence: 0.9,
          tags: [] as string[],
          requestableScopes: ["metadata", "snippet", "file"] as Array<
            "metadata" | "snippet" | "file"
          >,
          folderId: input.folderId,
        };
        extractMemoryId = memory.id;
        return {
          memory,
          people: [
            {
              id: personId,
              createdAt: t,
              updatedAt: t,
              ownerPeerId: OWNER,
              provenance: { kind: "extraction" as const },
              displayName: "Jane Doe",
              aliases: [] as string[],
            },
          ],
          places: [],
          events: [],
          tasks: [
            {
              id: taskId,
              createdAt: t,
              updatedAt: t,
              ownerPeerId: OWNER,
              provenance: { kind: "extraction" as const },
              title: "Send draft",
              status: "open" as const,
            },
          ],
          externalRefs: [],
        };
      }
    ),
    transcribeAudio: vi.fn(),
  };
});

// No high-similarity dedup hit → capture proceeds as new.
vi.mock("@vault/retrieval", () => ({
  search: vi.fn(async () => []),
}));

import { Repo, Indexes } from "@vault/sync";
import { captureText, type CaptureDeps } from "../src/routes/capture.js";

// In-memory shared store backing a real Repo + Indexes, matching the
// Hyperbee createReadStream(gte/lt) + get contract (see sync repo-folder.test).
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

function makeDeps(): { deps: CaptureDeps; indexes: Indexes } {
  const { view, append } = makeBackend();
  const repo = new Repo({ view: view as never, append, ownerPeerId: OWNER });
  const indexes = new Indexes({ view: view as never, append });
  const workspace = {
    getName: () => "ws",
    ingest: vi.fn(async () => undefined),
  } as never;
  const deps: CaptureDeps = {
    pool: {} as never,
    repo,
    indexes,
    workspace,
    fs: {} as never,
    ownerPeerId: OWNER,
    capturesFolderId: CAPTURES_FOLDER,
  };
  return { deps, indexes };
}

describe("captureText writes typed relationship edges + folder/meta indexes", () => {
  it("links the memory to its source, person, and task", async () => {
    const { deps, indexes } = makeDeps();
    const result = await captureText(deps, {
      text: "Met Jane Doe; need to send the draft.",
      tags: [],
    });

    expect(result.memoryId).toBe(extractMemoryId);

    const from = await indexes.relationshipsFrom(result.memoryId);
    const types = from.map((e) => e.type).sort();
    expect(types).toContain("mentions"); // memory -> person
    expect(types).toContain("references"); // memory -> task
    expect(types).toContain("derived-from"); // memory -> sourceRecord

    // Edge targets resolve to the right entities.
    const byType = new Map(from.map((e) => [e.type, e.toId]));
    expect(byType.get("mentions")).toBe(personId);
    expect(byType.get("references")).toBe(taskId);
    expect(byType.get("derived-from")).toBe(extractSourceRecordId);

    // Folder index + meta side-index were written.
    expect(await indexes.memoryIdsForFolder(deps.capturesFolderId)).toContain(
      result.memoryId
    );
    expect((await indexes.metaForMemories([result.memoryId])).has(result.memoryId)).toBe(
      true
    );
  });
});
