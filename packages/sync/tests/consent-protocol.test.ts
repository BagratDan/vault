import { describe, expect, it } from "vitest";
import {
  consentRequestShape,
  consentResponseShape,
  isScopeAllowed,
  type ConsentResponse,
} from "../src/consent-protocol.js";

const ULID = "01J0ABCDEFGHJKMNPQRSTV0001";

describe("consentRequestShape", () => {
  it("parses a valid request", () => {
    const r = {
      v: 1 as const,
      method: "consent.request" as const,
      consentRequestId: ULID,
      memoryId: ULID,
      scope: "snippet" as const,
      requesterDisplayName: "Marcus",
      ts: "2026-05-26T10:00:00.000Z",
    };
    const parsed = consentRequestShape.parse(r);
    expect(parsed).toEqual(r);
  });

  it("rejects an unknown scope", () => {
    expect(
      consentRequestShape.safeParse({
        v: 1,
        method: "consent.request",
        consentRequestId: ULID,
        memoryId: ULID,
        scope: "everything",
        requesterDisplayName: "Marcus",
        ts: "2026-05-26T10:00:00.000Z",
      }).success
    ).toBe(false);
  });
});

describe("consentResponseShape (discriminated union)", () => {
  it("parses an approve-snippet reply", () => {
    const r: ConsentResponse = {
      v: 1,
      method: "consent.response",
      consentRequestId: ULID,
      kind: "approve",
      scope: "snippet",
      payload: { text: "indemnification clause from Acme MSA 2025" },
    };
    expect(consentResponseShape.parse(r)).toEqual(r);
  });

  it("parses a deny reply with reason", () => {
    const r: ConsentResponse = {
      v: 1,
      method: "consent.response",
      consentRequestId: ULID,
      kind: "deny",
      reason: "scope-not-permitted",
    };
    expect(consentResponseShape.parse(r)).toEqual(r);
  });

  it("parses an expire reply (no payload field)", () => {
    const r: ConsentResponse = {
      v: 1,
      method: "consent.response",
      consentRequestId: ULID,
      kind: "expire",
    };
    expect(consentResponseShape.parse(r)).toEqual(r);
  });

  it("rejects a malformed kind", () => {
    expect(
      consentResponseShape.safeParse({
        v: 1,
        method: "consent.response",
        consentRequestId: ULID,
        kind: "maybe",
      }).success
    ).toBe(false);
  });
});

describe("isScopeAllowed", () => {
  it("returns true when requested == max of allowed set", () => {
    expect(isScopeAllowed(["metadata", "snippet"], "snippet")).toBe(true);
  });

  it("returns true when requested is below the ceiling", () => {
    expect(isScopeAllowed(["snippet", "file"], "metadata")).toBe(true);
  });

  it("returns false when requested exceeds the ceiling", () => {
    expect(isScopeAllowed(["metadata", "snippet"], "file")).toBe(false);
  });

  it("returns false on empty requestableScopes", () => {
    expect(isScopeAllowed([], "metadata")).toBe(false);
  });

  it("works regardless of array order", () => {
    expect(isScopeAllowed(["file", "metadata"], "snippet")).toBe(true);
    expect(isScopeAllowed(["snippet", "metadata"], "file")).toBe(false);
  });
});
