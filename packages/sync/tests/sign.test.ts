import { describe, expect, it } from "vitest";
import crypto from "hypercore-crypto";
import { canonicalJson, signCanonical, verifyCanonical } from "../src/sign.js";

describe("canonicalJson", () => {
  it("sorts object keys recursively", () => {
    const out = canonicalJson({ b: 1, a: { d: 2, c: 3 } });
    expect(out).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("preserves array order", () => {
    expect(canonicalJson({ x: [3, 1, 2] })).toBe('{"x":[3,1,2]}');
  });

  it("returns the same output for two structurally equal objects", () => {
    const a = canonicalJson({ a: 1, b: 2 });
    const b = canonicalJson({ b: 2, a: 1 });
    expect(a).toBe(b);
  });
});

describe("sign / verify roundtrip", () => {
  it("verifies a signature produced by signCanonical", () => {
    const { publicKey, secretKey } = crypto.keyPair();
    const payload = { vaultId: "v1", role: "admin", n: 42 };
    const sig = signCanonical(payload, secretKey);
    expect(typeof sig).toBe("string");
    expect(sig).toHaveLength(128); // hex(64 bytes)
    expect(verifyCanonical(payload, sig, publicKey)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const { publicKey, secretKey } = crypto.keyPair();
    const sig = signCanonical({ x: 1 }, secretKey);
    expect(verifyCanonical({ x: 2 }, sig, publicKey)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const { publicKey, secretKey } = crypto.keyPair();
    const sig = signCanonical({ x: 1 }, secretKey);
    const bad = "0" + sig.slice(1);
    expect(verifyCanonical({ x: 1 }, bad, publicKey)).toBe(false);
  });
});
