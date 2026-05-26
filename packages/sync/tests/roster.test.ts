import { describe, expect, it } from "vitest";
import { loadRoster, loadRevoked } from "../src/roster.js";

interface BeeLike {
  get(key: string): Promise<{ value: unknown } | null>;
  createReadStream(opts: { gte?: string; lt?: string }): AsyncIterable<{
    key: string;
    value: unknown;
  }>;
}

function fakeBee(records: Record<string, unknown>): BeeLike {
  return {
    async get(key) {
      return key in records ? { value: records[key] } : null;
    },
    async *createReadStream({ gte = "", lt = "\u{10FFFF}" }) {
      for (const k of Object.keys(records).sort()) {
        if (k >= gte && k < lt) yield { key: k, value: records[k] };
      }
    },
  };
}

describe("loadRoster", () => {
  it("returns a Map keyed by peerId", async () => {
    const bee = fakeBee({
      "member/aaaaaaaa": { peerId: "aaaaaaaa", role: "admin", displayName: "Sarah" },
      "member/bbbbbbbb": { peerId: "bbbbbbbb", role: "member", displayName: "Marcus" },
      "mem/01J0AAA": { summary: "irrelevant" },
    });
    const roster = await loadRoster(bee as never);
    expect(roster.size).toBe(2);
    expect(roster.get("aaaaaaaa")?.role).toBe("admin");
    expect(roster.get("bbbbbbbb")?.displayName).toBe("Marcus");
  });

  it("returns empty Map when no members yet", async () => {
    expect((await loadRoster(fakeBee({}) as never)).size).toBe(0);
  });

  it("skips entries that don't have a peerId", async () => {
    const bee = fakeBee({
      "member/aaaaaaaa": { peerId: "aaaaaaaa", role: "admin", displayName: "Sarah" },
      "member/zzzzzzzz": { displayName: "garbage" },
    });
    const roster = await loadRoster(bee as never);
    expect(roster.size).toBe(1);
    expect(roster.has("aaaaaaaa")).toBe(true);
  });
});

describe("loadRevoked", () => {
  it("returns a Set of revoked peerIds", async () => {
    const bee = fakeBee({
      "revocation/01J0R1": { targetPeerId: "bbbbbbbb" },
      "revocation/01J0R2": { targetPeerId: "cccccccc" },
    });
    const revoked = await loadRevoked(bee as never);
    expect(revoked.size).toBe(2);
    expect(revoked.has("bbbbbbbb")).toBe(true);
    expect(revoked.has("cccccccc")).toBe(true);
  });

  it("returns empty set when no revocations exist", async () => {
    expect((await loadRevoked(fakeBee({}) as never)).size).toBe(0);
  });
});
