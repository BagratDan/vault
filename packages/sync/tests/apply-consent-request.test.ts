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
  const base = { async addWriter(_key: Uint8Array) {} };
  return { data, view, base };
}

describe("apply() — consentRequest kind", () => {
  const founder = crypto.keyPair();
  const founderPeerId = b4a.toString(founder.publicKey, "hex");
  const member = crypto.keyPair();
  const memberPeerId = b4a.toString(member.publicKey, "hex");
  const stranger = crypto.keyPair();
  const strangerPeerId = b4a.toString(stranger.publicKey, "hex");
  const deps: ApplyDeps = { founderPeerId };

  function node(value: Op | { type: "addWriter"; key: Uint8Array }, fromHex = founderPeerId) {
    return { value, from: { key: b4a.from(fromHex, "hex") } };
  }

  function founderMemberOp(): Op {
    const rec = {
      id: "01J0ABC0000000000000000001",
      kind: "member" as const,
      peerId: founderPeerId,
      displayName: "Sarah",
      role: "admin" as const,
      admittedBy: founderPeerId,
      admittedAt: "2026-05-26T10:00:00.000Z",
      publicKey: founderPeerId,
    };
    return { kind: "member", key: `member/${founderPeerId}`, value: { ...rec, sig: signCanonical(rec, founder.secretKey) } };
  }

  function admitMemberOp(): Op {
    const rec = {
      id: "01J0ABC0000000000000000002",
      kind: "member" as const,
      peerId: memberPeerId,
      displayName: "Marcus",
      role: "member" as const,
      admittedBy: founderPeerId,
      admittedAt: "2026-05-26T10:01:00.000Z",
      publicKey: memberPeerId,
    };
    return { kind: "member", key: `member/${memberPeerId}`, value: { ...rec, sig: signCanonical(rec, founder.secretKey) } };
  }

  function reqBody(requesterPeerId: string, id = "01J0REQ0000000000000000001") {
    return {
      id,
      createdAt: "2026-05-26T10:02:00.000Z",
      updatedAt: "2026-05-26T10:02:00.000Z",
      ownerPeerId: founderPeerId,
      provenance: { kind: "user" as const },
      kind: "consentRequest" as const,
      requesterPeerId,
      memoryId: "01J0MEM0000000000000000001",
      scope: "snippet" as const,
      requesterDisplayName: "Marcus",
      expiresAt: "2026-05-26T10:07:00.000Z",
    };
  }

  async function bootstrap(view: unknown, base: unknown) {
    const apply = makeApply(deps);
    await apply([node(founderMemberOp())], view as never, base as never);
    await apply([node(admitMemberOp())], view as never, base as never);
    return apply;
  }

  it("accepts a self-signed consentRequest from an admitted member", async () => {
    const { data, view, base } = makeStore();
    const apply = await bootstrap(view, base);
    const body = reqBody(memberPeerId);
    await apply(
      [node({ kind: "consentRequest", key: `consentReq/${body.id}`, value: { ...body, sig: signCanonical(body, member.secretKey) } }, memberPeerId)],
      view as never, base as never
    );
    expect(data[`consentReq/${body.id}`]).toBeDefined();
  });

  it("rejects a consentRequest whose requesterPeerId is not the writer (impersonation)", async () => {
    const { data, view, base } = makeStore();
    const apply = await bootstrap(view, base);
    // Member writes a request claiming the founder is the requester
    const body = reqBody(founderPeerId, "01J0REQ0000000000000000002");
    await apply(
      [node({ kind: "consentRequest", key: `consentReq/${body.id}`, value: { ...body, sig: signCanonical(body, member.secretKey) } }, memberPeerId)],
      view as never, base as never
    );
    expect(data[`consentReq/${body.id}`]).toBeUndefined();
  });

  it("rejects a consentRequest from a peer not in the roster", async () => {
    const { data, view, base } = makeStore();
    const apply = await bootstrap(view, base);
    const body = reqBody(strangerPeerId, "01J0REQ0000000000000000003");
    await apply(
      [node({ kind: "consentRequest", key: `consentReq/${body.id}`, value: { ...body, sig: signCanonical(body, stranger.secretKey) } }, strangerPeerId)],
      view as never, base as never
    );
    expect(data[`consentReq/${body.id}`]).toBeUndefined();
  });

  it("rejects a consentRequest from a revoked member", async () => {
    const { data, view, base } = makeStore();
    const apply = await bootstrap(view, base);
    // Admin revokes the member
    const revocation = {
      id: "01J0R000000000000000000001",
      kind: "revocation" as const,
      targetPeerId: memberPeerId,
      issuedBy: founderPeerId,
      effectiveAt: "2026-05-26T10:03:00.000Z",
    };
    await apply(
      [node({ kind: "revocation", key: `revocation/${revocation.id}`, value: { ...revocation, sig: signCanonical(revocation, founder.secretKey) } })],
      view as never, base as never
    );
    // Revoked member tries to write a request
    const body = reqBody(memberPeerId, "01J0REQ0000000000000000004");
    await apply(
      [node({ kind: "consentRequest", key: `consentReq/${body.id}`, value: { ...body, sig: signCanonical(body, member.secretKey) } }, memberPeerId)],
      view as never, base as never
    );
    expect(data[`consentReq/${body.id}`]).toBeUndefined();
  });

  it("rejects a consentRequest with a bad signature", async () => {
    const { data, view, base } = makeStore();
    const apply = await bootstrap(view, base);
    const body = reqBody(memberPeerId, "01J0REQ0000000000000000005");
    const badSig = signCanonical({ ...body, scope: "file" }, member.secretKey); // signs a different body
    await apply(
      [node({ kind: "consentRequest", key: `consentReq/${body.id}`, value: { ...body, sig: badSig } }, memberPeerId)],
      view as never, base as never
    );
    expect(data[`consentReq/${body.id}`]).toBeUndefined();
  });
});
