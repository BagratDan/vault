import { describe, expect, it } from "vitest";
import { sourceRecordShape } from "../src/source-record.js";

const HEX_64 = "a".repeat(64);
const ULID = "01J0ABCDEFGHJKMNPQRSTV0001";
const now = "2026-05-26T10:00:00.000Z";

describe("sourceRecordShape — file variant", () => {
  it("parses a file SourceRecord", () => {
    const s = {
      id: ULID,
      createdAt: now,
      updatedAt: now,
      ownerPeerId: HEX_64,
      provenance: { kind: "user" as const },
      kind: "file" as const,
      path: "/Users/sarah/Documents/Acme/MSA.pdf",
      hash: "sha256:" + "0".repeat(64),
      size: 12345,
      mime: "application/pdf",
      lastModified: now,
    };
    expect(sourceRecordShape.parse(s)).toEqual(s);
  });

  it("rejects malformed hash", () => {
    const r = sourceRecordShape.safeParse({
      id: ULID,
      createdAt: now,
      updatedAt: now,
      ownerPeerId: HEX_64,
      provenance: { kind: "user" },
      kind: "file",
      path: "/x",
      hash: "not-a-sha",
      size: 1,
      mime: "x",
      lastModified: now,
    });
    expect(r.success).toBe(false);
  });

  it("rejects negative size", () => {
    const r = sourceRecordShape.safeParse({
      id: ULID,
      createdAt: now,
      updatedAt: now,
      ownerPeerId: HEX_64,
      provenance: { kind: "user" },
      kind: "file",
      path: "/x",
      hash: "sha256:" + "0".repeat(64),
      size: -1,
      mime: "x",
      lastModified: now,
    });
    expect(r.success).toBe(false);
  });
});
