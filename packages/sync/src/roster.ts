/**
 * Shape of a Member record as stored in the Autobee view (key prefix
 * `member/`). The `publicKey` is hex of the Ed25519 public key (= peerId
 * by construction). `admittedBy` / `admittedAt` are optional in the
 * reader because the founder bootstrap writes its own Member record
 * before any "admitter" exists.
 */
export interface RosterMember {
  peerId: string;
  displayName: string;
  role: "admin" | "member";
  publicKey?: string;
  admittedBy?: string;
  admittedAt?: string;
}

interface BeeLike {
  get(key: string): Promise<{ value: unknown } | null>;
  createReadStream(opts: {
    gte?: string;
    lt?: string;
  }): AsyncIterable<{ key: string; value: unknown }>;
}

const ROSTER_PREFIX = "member/";
const REVOCATION_PREFIX = "revocation/";

/** Read every `member/*` record into a Map keyed by peerId. */
export async function loadRoster(view: unknown): Promise<Map<string, RosterMember>> {
  const bee = view as BeeLike;
  const out = new Map<string, RosterMember>();
  for await (const node of bee.createReadStream({
    gte: ROSTER_PREFIX,
    lt: ROSTER_PREFIX + "~",
  })) {
    const m = node.value as RosterMember;
    if (m && typeof m.peerId === "string") out.set(m.peerId, m);
  }
  return out;
}

/** Read every `revocation/*` record's targetPeerId into a Set. */
export async function loadRevoked(view: unknown): Promise<Set<string>> {
  const bee = view as BeeLike;
  const out = new Set<string>();
  for await (const node of bee.createReadStream({
    gte: REVOCATION_PREFIX,
    lt: REVOCATION_PREFIX + "~",
  })) {
    const r = node.value as { targetPeerId: string };
    if (r && typeof r.targetPeerId === "string") out.add(r.targetPeerId);
  }
  return out;
}
