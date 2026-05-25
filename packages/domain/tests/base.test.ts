import { describe, expect, it } from "vitest";
import { type BaseRecord, baseRecordShape } from "../src/base.js";
import { newUlid } from "../src/ids.js";

describe("BaseRecord", () => {
  const fixture: BaseRecord = {
    id: newUlid(),
    createdAt: "2026-05-26T10:00:00.000Z",
    updatedAt: "2026-05-26T10:00:00.000Z",
    ownerPeerId: "a".repeat(64), // 32-byte hex
    provenance: { kind: "user", note: "manual capture" },
  };

  it("accepts a well-formed record", () => {
    const parsed = baseRecordShape.parse(fixture);
    expect(parsed).toEqual(fixture);
  });

  it("rejects when ownerPeerId is not 64-char hex", () => {
    const r = { ...fixture, ownerPeerId: "short" };
    const result = baseRecordShape.safeParse(r);
    expect(result.success).toBe(false);
  });

  it("rejects when createdAt is not ISO 8601", () => {
    const r = { ...fixture, createdAt: "yesterday" };
    expect(baseRecordShape.safeParse(r).success).toBe(false);
  });

  it("accepts optional deletedAt", () => {
    const r = { ...fixture, deletedAt: "2026-05-26T11:00:00.000Z" };
    expect(baseRecordShape.safeParse(r).success).toBe(true);
  });
});
