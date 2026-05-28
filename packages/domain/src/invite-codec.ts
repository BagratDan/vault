import crypto from "hypercore-crypto";
import b4a from "b4a";

export interface InvitePayload {
  v: 1;
  vaultId: string;
  vaultName: string;
  topic: string;            // hex(32)
  bootstrapKey: string;     // hex(32)
  founderPeerId: string;    // hex(32)
  founderPublicKey: string; // hex(32) — Ed25519 public key
  placeholderDisplayName?: string;
  expiresAt: string;        // ISO8601
}

interface Envelope {
  p: InvitePayload;
  s: string; // hex Ed25519 sig over canonicalJson(p)
}

export type ParseInviteResult =
  | { ok: true; payload: InvitePayload }
  | { ok: false; reason: "malformed" | "bad-signature" | "expired" };

function canonicalJson(value: unknown): string {
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

export function serializeInvite(
  payload: InvitePayload,
  secretKey: Uint8Array
): string {
  const message = b4a.from(canonicalJson(payload), "utf8");
  const sig = crypto.sign(message, secretKey);
  const env: Envelope = { p: payload, s: b4a.toString(sig, "hex") };
  return b4a.toString(b4a.from(JSON.stringify(env), "utf8"), "base64url");
}

export function parseInvite(token: string): ParseInviteResult {
  let env: Envelope;
  try {
    const json = b4a.toString(b4a.from(token, "base64url"), "utf8");
    env = JSON.parse(json) as Envelope;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!env || typeof env !== "object" || !env.p || !env.s) {
    return { ok: false, reason: "malformed" };
  }
  const publicKey = (() => {
    try {
      return b4a.from(env.p.founderPublicKey, "hex");
    } catch {
      return null;
    }
  })();
  if (!publicKey || publicKey.length !== 32) {
    return { ok: false, reason: "malformed" };
  }
  const message = b4a.from(canonicalJson(env.p), "utf8");
  const sig = (() => {
    try {
      return b4a.from(env.s, "hex");
    } catch {
      return null;
    }
  })();
  if (!sig || sig.length !== 64) {
    return { ok: false, reason: "bad-signature" };
  }
  let valid = false;
  try {
    valid = crypto.verify(message, sig, publicKey);
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: "bad-signature" };
  if (Date.parse(env.p.expiresAt) < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, payload: env.p };
}
