import { describe, expect, it } from "vitest";
import crypto from "hypercore-crypto";
import b4a from "b4a";
import {
  serializeInvite,
  parseInvite,
  type InvitePayload,
} from "../src/invite-codec.js";

const fixture = (overrides: Partial<InvitePayload> = {}): InvitePayload => ({
  v: 1,
  vaultId: "01J0AAA00000000000000000AB",
  vaultName: "Acme Legal",
  topic: "a".repeat(64),
  bootstrapKey: "b".repeat(64),
  founderPeerId: "c".repeat(64),
  founderPublicKey: "c".repeat(64),
  placeholderDisplayName: "Marcus",
  expiresAt: "2027-01-01T00:00:00.000Z",
  ...overrides,
});

describe("serialize/parse roundtrip", () => {
  it("verifies a token signed with the founder's secret key", () => {
    const { publicKey, secretKey } = crypto.keyPair();
    const payload = fixture({ founderPublicKey: b4a.toString(publicKey, "hex") });
    const token = serializeInvite(payload, secretKey);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(200);
    const parsed = parseInvite(token);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.payload).toEqual(payload);
    }
  });
});

describe("rejects bad tokens", () => {
  it("rejects malformed base64url", () => {
    expect(parseInvite("not-a-token").ok).toBe(false);
  });

  it("rejects tampered payload (signature won't verify)", () => {
    const { publicKey, secretKey } = crypto.keyPair();
    const payload = fixture({ founderPublicKey: b4a.toString(publicKey, "hex") });
    const token = serializeInvite(payload, secretKey);
    // Decode → mutate → re-encode without re-signing
    const decoded = JSON.parse(
      b4a.toString(b4a.from(token, "base64url"), "utf8")
    );
    decoded.p.vaultName = "Tampered Inc";
    const tampered = b4a.toString(
      b4a.from(JSON.stringify(decoded), "utf8"),
      "base64url"
    );
    expect(parseInvite(tampered).ok).toBe(false);
  });

  it("rejects expired token", () => {
    const { publicKey, secretKey } = crypto.keyPair();
    const payload = fixture({
      founderPublicKey: b4a.toString(publicKey, "hex"),
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    const token = serializeInvite(payload, secretKey);
    const result = parseInvite(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });
});
