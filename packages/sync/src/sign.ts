import crypto from "hypercore-crypto";
import b4a from "b4a";

/**
 * Stable JSON serialization with sorted object keys (recursively). Two
 * structurally equal objects always produce the same string, so signing
 * the canonical form yields stable signatures regardless of key order.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        sorted[k] = (v as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return v;
  });
}

/** Sign `canonicalJson(payload)` with Ed25519. Returns lowercase hex. */
export function signCanonical(payload: unknown, secretKey: Uint8Array): string {
  const message = b4a.from(canonicalJson(payload), "utf8");
  const sig = crypto.sign(message, secretKey);
  return b4a.toString(sig, "hex");
}

/** Verify hex signature against `canonicalJson(payload)` and public key. */
export function verifyCanonical(
  payload: unknown,
  signatureHex: string,
  publicKey: Uint8Array
): boolean {
  if (!/^[0-9a-f]{128}$/.test(signatureHex)) return false;
  const message = b4a.from(canonicalJson(payload), "utf8");
  const sig = b4a.from(signatureHex, "hex");
  try {
    return crypto.verify(message, sig, publicKey);
  } catch {
    return false;
  }
}
