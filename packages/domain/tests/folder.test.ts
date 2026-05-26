import { describe, expect, it } from "vitest";
import {
  folderShape,
  folderPublicShape,
  folderVisibilityShape,
} from "../src/folder.js";

const HEX_64 = "a".repeat(64);
const ULID = "01J0ABCDEFGHJKMNPQRSTV0001";
const now = "2026-05-26T10:00:00.000Z";

describe("folderVisibilityShape", () => {
  it("accepts public + private", () => {
    expect(folderVisibilityShape.parse("public")).toBe("public");
    expect(folderVisibilityShape.parse("private")).toBe("private");
  });
  it("rejects other strings", () => {
    expect(folderVisibilityShape.safeParse("hidden").success).toBe(false);
  });
});

describe("folderShape (owner-local)", () => {
  it("parses a valid full record with path", () => {
    const f = {
      id: ULID,
      createdAt: now,
      updatedAt: now,
      ownerPeerId: HEX_64,
      provenance: { kind: "user" as const },
      kind: "folder" as const,
      path: "/Users/sarah/Documents/Acme",
      displayName: "Acme MSA",
      visibility: "public" as const,
    };
    expect(folderShape.parse(f)).toEqual(f);
  });
  it("rejects when path is missing", () => {
    const r = folderShape.safeParse({
      id: ULID,
      createdAt: now,
      updatedAt: now,
      ownerPeerId: HEX_64,
      provenance: { kind: "user" },
      kind: "folder",
      displayName: "x",
      visibility: "public",
    });
    expect(r.success).toBe(false);
  });
});

describe("folderPublicShape (synced)", () => {
  it("parses with sig + no path", () => {
    const f = {
      id: ULID,
      createdAt: now,
      updatedAt: now,
      ownerPeerId: HEX_64,
      provenance: { kind: "user" as const },
      kind: "folder" as const,
      displayName: "Acme MSA",
      visibility: "public" as const,
      sig: "00".repeat(64),
    };
    expect(folderPublicShape.parse(f)).toEqual(f);
  });
});
