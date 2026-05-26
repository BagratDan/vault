import { describe, expect, it } from "vitest";
import { memoryShape } from "../src/memory.js";

const HEX_64 = "a".repeat(64);
const ULID = "01J0ABCDEFGHJKMNPQRSTV0001";

describe("memoryShape (Plan 4 — folderId required)", () => {
  it("parses with folderId", () => {
    const m = {
      id: ULID,
      createdAt: "2026-05-26T10:00:00.000Z",
      updatedAt: "2026-05-26T10:00:00.000Z",
      ownerPeerId: HEX_64,
      provenance: { kind: "user" as const },
      summary: "x",
      body: "x",
      sourceRecordId: ULID,
      confidence: 0.5,
      tags: [],
      requestableScopes: ["metadata", "snippet", "file"] as const,
      folderId: ULID,
    };
    expect(memoryShape.parse(m)).toEqual(m);
  });

  it("rejects when folderId is missing", () => {
    const r = memoryShape.safeParse({
      id: ULID,
      createdAt: "2026-05-26T10:00:00.000Z",
      updatedAt: "2026-05-26T10:00:00.000Z",
      ownerPeerId: HEX_64,
      provenance: { kind: "user" },
      summary: "x",
      body: "x",
      sourceRecordId: ULID,
      confidence: 0.5,
      tags: [],
      requestableScopes: [],
    });
    expect(r.success).toBe(false);
  });
});
