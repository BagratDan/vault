import { describe, expect, it } from "vitest";
import crypto from "hypercore-crypto";
import b4a from "b4a";
import { signCanonical } from "../src/sign.js";
import { makeApply, type Op, type ApplyDeps } from "../src/apply.js";

interface Stored {
  [key: string]: unknown;
}

function makeStore() {
  const data: Stored = {};
  const view = {
    async get(key: string) {
      return key in data ? { value: data[key] } : null;
    },
    async put(key: string, value: unknown) {
      data[key] = value;
    },
    async *createReadStream({ gte = "", lt = "\u{10FFFF}" }) {
      for (const k of Object.keys(data).sort()) {
        if (k >= gte && k < lt) yield { key: k, value: data[k] };
      }
    },
  };
  const addWriterCalls: Uint8Array[] = [];
  const base = {
    async addWriter(key: Uint8Array) { addWriterCalls.push(key); },
  };
  return { data, view, base, addWriterCalls };
}

describe("apply()", () => {
  const founder = crypto.keyPair();
  const founderPeerId = b4a.toString(founder.publicKey, "hex");
  const stranger = crypto.keyPair();
  const strangerPeerId = b4a.toString(stranger.publicKey, "hex");

  const deps: ApplyDeps = { founderPeerId };

  function node(value: Op | { type: "addWriter"; key: Uint8Array }, fromHex = founderPeerId) {
    return {
      value,
      from: { key: b4a.from(fromHex, "hex") },
    };
  }

  it("accepts the founder's bootstrap Member record into the empty roster", async () => {
    const { data, view, base } = makeStore();
    const apply = makeApply(deps);
    const memberRecord = {
      id: "01J0ABC0000000000000000001",
      kind: "member" as const,
      peerId: founderPeerId,
      displayName: "Sarah",
      role: "admin" as const,
      admittedBy: founderPeerId,
      admittedAt: "2026-05-26T10:00:00.000Z",
      publicKey: founderPeerId,
    };
    const op: Op = {
      kind: "member",
      key: `member/${founderPeerId}`,
      value: { ...memberRecord, sig: signCanonical(memberRecord, founder.secretKey) },
    };
    await apply([node(op)], view as never, base as never);
    expect(data[`member/${founderPeerId}`]).toBeDefined();
  });

  it("rejects writes from peers not in the roster", async () => {
    const { data, view, base } = makeStore();
    const apply = makeApply(deps);
    // Bootstrap founder first
    const founderMember = {
      id: "01J0ABC0000000000000000001",
      kind: "member" as const,
      peerId: founderPeerId,
      displayName: "Sarah",
      role: "admin" as const,
      admittedBy: founderPeerId,
      admittedAt: "2026-05-26T10:00:00.000Z",
      publicKey: founderPeerId,
    };
    await apply(
      [node({ kind: "member", key: `member/${founderPeerId}`,
        value: { ...founderMember, sig: signCanonical(founderMember, founder.secretKey) } })],
      view as never, base as never
    );
    // Stranger tries to write a content record
    const memOp: Op = {
      kind: "memory",
      key: "mem/01J0M0000000000000000000",
      value: { id: "01J0M0000000000000000000", summary: "hello" },
    };
    await apply([node(memOp, strangerPeerId)], view as never, base as never);
    expect(data["mem/01J0M0000000000000000000"]).toBeUndefined();
  });

  it("admin Member admission lets the new peer's subsequent writes through", async () => {
    const { data, view, base } = makeStore();
    const apply = makeApply(deps);
    // Bootstrap founder
    const founderMember = {
      id: "01J0ABC0000000000000000001",
      kind: "member" as const,
      peerId: founderPeerId,
      displayName: "Sarah",
      role: "admin" as const,
      admittedBy: founderPeerId,
      admittedAt: "2026-05-26T10:00:00.000Z",
      publicKey: founderPeerId,
    };
    await apply(
      [node({ kind: "member", key: `member/${founderPeerId}`,
        value: { ...founderMember, sig: signCanonical(founderMember, founder.secretKey) } })],
      view as never, base as never
    );
    // Admin admits a new member
    const newMemberRec = {
      id: "01J0ABC0000000000000000002",
      kind: "member" as const,
      peerId: strangerPeerId,
      displayName: "Marcus",
      role: "member" as const,
      admittedBy: founderPeerId,
      admittedAt: "2026-05-26T10:01:00.000Z",
      publicKey: strangerPeerId,
    };
    await apply(
      [node({ kind: "member", key: `member/${strangerPeerId}`,
        value: { ...newMemberRec, sig: signCanonical(newMemberRec, founder.secretKey) } })],
      view as never, base as never
    );
    expect(data[`member/${strangerPeerId}`]).toBeDefined();
    // Now stranger writes content — should be accepted (new batch, roster reloaded)
    const memOp: Op = {
      kind: "memory",
      key: "mem/01J0M0000000000000000001",
      value: { id: "01J0M0000000000000000001", summary: "hi" },
    };
    await apply([node(memOp, strangerPeerId)], view as never, base as never);
    expect(data["mem/01J0M0000000000000000001"]).toBeDefined();
  });

  it("Member record with a bad signature is silently dropped", async () => {
    const { data, view, base } = makeStore();
    const apply = makeApply(deps);
    // Bootstrap founder first so the roster lookup for admittedBy works
    const founderMember = {
      id: "01J0ABC0000000000000000001",
      kind: "member" as const,
      peerId: founderPeerId,
      displayName: "Sarah",
      role: "admin" as const,
      admittedBy: founderPeerId,
      admittedAt: "2026-05-26T10:00:00.000Z",
      publicKey: founderPeerId,
    };
    await apply(
      [node({ kind: "member", key: `member/${founderPeerId}`,
        value: { ...founderMember, sig: signCanonical(founderMember, founder.secretKey) } })],
      view as never, base as never
    );
    // Now an op with a bad sig
    const bad = {
      id: "01J0BAD",
      kind: "member" as const,
      peerId: strangerPeerId,
      displayName: "Imposter",
      role: "member" as const,
      admittedBy: founderPeerId,
      admittedAt: "2026-05-26T10:01:00.000Z",
      publicKey: strangerPeerId,
      sig: "00".repeat(64), // bad sig
    };
    await apply(
      [node({ kind: "member", key: `member/${strangerPeerId}`, value: bad })],
      view as never, base as never
    );
    expect(data[`member/${strangerPeerId}`]).toBeUndefined();
  });

  it("Revocation by a non-admin is rejected", async () => {
    const { data, view, base } = makeStore();
    const apply = makeApply(deps);
    // Bootstrap founder
    const founderMember = {
      id: "01J0ABC0000000000000000001",
      kind: "member" as const,
      peerId: founderPeerId,
      displayName: "Sarah",
      role: "admin" as const,
      admittedBy: founderPeerId,
      admittedAt: "2026-05-26T10:00:00.000Z",
      publicKey: founderPeerId,
    };
    await apply(
      [node({ kind: "member", key: `member/${founderPeerId}`,
        value: { ...founderMember, sig: signCanonical(founderMember, founder.secretKey) } })],
      view as never, base as never
    );
    // Admin admits stranger as a regular member
    const strangerMember = {
      id: "01J0ABC0000000000000000002",
      kind: "member" as const,
      peerId: strangerPeerId,
      displayName: "Marcus",
      role: "member" as const,
      admittedBy: founderPeerId,
      admittedAt: "2026-05-26T10:01:00.000Z",
      publicKey: strangerPeerId,
    };
    await apply(
      [node({ kind: "member", key: `member/${strangerPeerId}`,
        value: { ...strangerMember, sig: signCanonical(strangerMember, founder.secretKey) } })],
      view as never, base as never
    );
    // Non-admin tries to revoke the admin
    const revocation = {
      id: "01J0R000000000000000000001",
      kind: "revocation" as const,
      targetPeerId: founderPeerId,
      issuedBy: strangerPeerId,
      effectiveAt: "2026-05-26T10:02:00.000Z",
    };
    await apply(
      [node({ kind: "revocation", key: `revocation/${revocation.id}`,
        value: { ...revocation, sig: signCanonical(revocation, stranger.secretKey) } },
        strangerPeerId)],
      view as never, base as never
    );
    expect(data[`revocation/${revocation.id}`]).toBeUndefined();
  });
});
