import { describe, expect, it } from "vitest";
import { consentRequestRecordShape } from "../src/consent-request.js";

const valid = {
  id: "01J0CAPTVRES000000000000AA",
  createdAt: "2026-05-27T10:00:00.000Z",
  updatedAt: "2026-05-27T10:00:00.000Z",
  ownerPeerId: "b".repeat(64),
  provenance: { kind: "user" as const },
  kind: "consentRequest" as const,
  requesterPeerId: "a".repeat(64),
  memoryId: "01J0CAPTVRES000000000000AB",
  scope: "snippet" as const,
  requesterDisplayName: "Marcus",
  expiresAt: "2026-05-27T10:05:00.000Z",
  sig: "deadbeef",
};

describe("consentRequestRecordShape", () => {
  it("accepts a well-formed record", () => {
    expect(consentRequestRecordShape.parse(valid)).toMatchObject({ kind: "consentRequest" });
  });
  it("rejects a bad scope", () => {
    expect(() => consentRequestRecordShape.parse({ ...valid, scope: "everything" })).toThrow();
  });
  it("rejects a non-hex requesterPeerId", () => {
    expect(() => consentRequestRecordShape.parse({ ...valid, requesterPeerId: "nope" })).toThrow();
  });
  it("requires expiresAt to be ISO", () => {
    expect(() => consentRequestRecordShape.parse({ ...valid, expiresAt: "soon" })).toThrow();
  });
});
