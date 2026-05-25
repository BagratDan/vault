import { describe, expect, it } from "vitest";
import { newUlid } from "../src/ids.js";
import {
  memberShape,
  inviteShape,
  revocationShape,
  consentEventShape,
} from "../src/index.js";

const base = {
  id: newUlid(),
  createdAt: "2026-05-26T10:00:00.000Z",
  updatedAt: "2026-05-26T10:00:00.000Z",
  ownerPeerId: "a".repeat(64),
  provenance: { kind: "user" as const },
};

describe("governance schemas", () => {
  it("memberShape: admin/member role enum", () => {
    const m = {
      ...base,
      peerId: "b".repeat(64),
      displayName: "Sarah Chen",
      role: "admin" as const,
      admittedBy: "c".repeat(64),
      admittedAt: "2026-05-26T10:00:00.000Z",
    };
    expect(memberShape.safeParse(m).success).toBe(true);
    expect(memberShape.safeParse({ ...m, role: "owner" }).success).toBe(false);
  });

  it("inviteShape requires sig and expiresAt", () => {
    const inv = {
      ...base,
      vaultId: newUlid(),
      issuedBy: "d".repeat(64),
      expiresAt: "2026-05-27T10:00:00.000Z",
      sig: "e".repeat(128),
    };
    expect(inviteShape.safeParse(inv).success).toBe(true);
    const { sig: _, ...bad } = inv;
    expect(inviteShape.safeParse(bad).success).toBe(false);
  });

  it("revocationShape requires target", () => {
    const r = {
      ...base,
      vaultId: newUlid(),
      targetPeerId: "f".repeat(64),
      issuedBy: "g".repeat(64),
      effectiveAt: "2026-05-26T10:00:00.000Z",
      sig: "h".repeat(128),
    };
    expect(revocationShape.safeParse(r).success).toBe(true);
  });

  it("consentEventShape: discriminated by kind", () => {
    const req = {
      ...base,
      requesterPeerId: "i".repeat(64),
      ownerPeerId: "j".repeat(64),
      resourceId: newUlid(),
      kind: "request" as const,
    };
    expect(consentEventShape.safeParse(req).success).toBe(true);

    const approve = {
      ...req,
      kind: "approve-snippet" as const,
      payloadHash: "sha256:" + "k".repeat(64),
      byteCount: 1024,
    };
    expect(consentEventShape.safeParse(approve).success).toBe(true);

    expect(
      consentEventShape.safeParse({ ...req, kind: "approve" }).success
    ).toBe(false);
  });
});
