/**
 * Two-peer integration test using an in-memory duplex pair (no Hyperswarm).
 *
 * Exercises the full Plan 2 contract:
 *   1. Founder opens an admin Autobee store and writes its own Member
 *   2. Founder generates a signed Invite token
 *   3. Member parses the invite and opens its own Autobee store
 *      (bootstrapped from the founder's writer key)
 *   4. An in-memory wireRpc channel is wired between them
 *   5. Member sends a signed MemberClaim
 *   6. Admin verifies + writes a Member record on the claimant's behalf
 *   7. Roster contains both peers
 *
 * Plan 2's E2E-2 (Task 19) does the same flow but via real Hyperswarm on
 * a developer machine. This in-process test is the deterministic, CI-safe
 * proof that the protocol is sound.
 */
import { describe, expect, it, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "hypercore-crypto";
import b4a from "b4a";
import { openAutobeeStore } from "../src/store.js";
import {
  wireRpc,
  type DuplexLike,
  type RpcSession,
} from "../src/swarm.js";
import { signCanonical, verifyCanonical } from "../src/sign.js";
import { loadRoster } from "../src/roster.js";
import { newUlid, serializeInvite, parseInvite } from "@vault/domain";

function makePair() {
  const a: DuplexLike = { write: (s) => b.onData?.(s) };
  const b: DuplexLike = { write: (s) => a.onData?.(s) };
  return { a, b };
}

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs) await fs.rm(d, { recursive: true, force: true });
  dirs.length = 0;
});

async function tmpDir(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), "vault-twopeer-"));
  dirs.push(d);
  return d;
}

describe("two-peer integration (in-memory transport)", () => {
  it("invite → claim → admission → roster has both peers", async () => {
    // 1. Founder opens admin Autobee
    const founderDir = await tmpDir();
    const founderTempPeerId = "f".repeat(64); // placeholder; openAutobeeStore derives real one
    const storeA = await openAutobeeStore({
      rootDir: founderDir,
      founderPeerId: founderTempPeerId,
      role: "admin",
    });
    const founderPeerId = storeA.localPeerId;

    // Founder writes own Member record
    const founderMember = {
      id: newUlid(),
      kind: "member" as const,
      peerId: founderPeerId,
      displayName: "Sarah",
      role: "admin" as const,
      admittedBy: founderPeerId,
      admittedAt: "2026-05-26T10:00:00.000Z",
      publicKey: founderPeerId,
    };
    await storeA.append({
      kind: "member",
      key: `member/${founderPeerId}`,
      value: {
        ...founderMember,
        sig: signCanonical(founderMember, storeA.secretKey),
      },
    });
    await storeA.flush();

    // 2. Founder generates an invite token (signs with autobee's local key)
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const token = serializeInvite(
      {
        v: 1,
        vaultId: newUlid(),
        vaultName: "Acme Legal",
        topic: "0".repeat(64), // unused in this test (in-memory transport)
        bootstrapKey: storeA.bootstrapKey,
        founderPeerId,
        founderPublicKey: founderPeerId,
        placeholderDisplayName: "Marcus",
        expiresAt,
      },
      storeA.secretKey
    );

    // 3. Member parses the invite
    const parsed = parseInvite(token);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("invite parse failed");
    const invite = parsed.payload;

    // 4. Member opens its own Autobee bootstrapped from founder's writer key
    const memberDir = await tmpDir();
    const storeB = await openAutobeeStore({
      rootDir: memberDir,
      founderPeerId: invite.founderPeerId,
      role: "member",
      bootstrapKey: invite.bootstrapKey,
    });
    const memberPeerId = storeB.localPeerId;

    // 5. Wire in-memory RPC channel; admin handles member.claim
    const { a, b } = makePair();
    let claimAdmitted = false;
    wireRpc(a, async (method, params) => {
      if (method !== "member.claim") return { ok: false };
      const claim = params as {
        v: 1;
        vaultId: string;
        peerId: string;
        publicKey: string;
        displayName: string;
        ts: string;
        sig: string;
      };
      const { sig, ...claimBody } = claim;
      const ok = verifyCanonical(claimBody, sig, b4a.from(claim.publicKey, "hex"));
      if (!ok) return { ok: false };
      // Admin writes Member record on claimant's behalf
      const memberRec = {
        id: newUlid(),
        kind: "member" as const,
        peerId: claim.peerId,
        displayName: claim.displayName,
        role: "member" as const,
        admittedBy: founderPeerId,
        admittedAt: claim.ts,
        publicKey: claim.publicKey,
      };
      await storeA.append({
        kind: "member",
        key: `member/${claim.peerId}`,
        value: {
          ...memberRec,
          sig: signCanonical(memberRec, storeA.secretKey),
        },
      });
      await storeA.flush();
      claimAdmitted = true;
      return { ok: true };
    });
    const bSession: RpcSession = wireRpc(b, async () => ({ ok: false }));

    // 6. Member sends claim
    const ts = "2026-05-26T10:01:00.000Z";
    const claimBody = {
      v: 1 as const,
      vaultId: invite.vaultId,
      peerId: memberPeerId,
      publicKey: memberPeerId,
      displayName: "Marcus",
      ts,
    };
    await bSession.request("member.claim", {
      ...claimBody,
      sig: signCanonical(claimBody, storeB.secretKey),
    });

    // 7. Verify admission landed
    expect(claimAdmitted).toBe(true);
    const roster = await loadRoster(storeA.view);
    expect(roster.size).toBe(2);
    expect(roster.has(founderPeerId)).toBe(true);
    expect(roster.has(memberPeerId)).toBe(true);
    expect(roster.get(memberPeerId)?.role).toBe("member");
    expect(roster.get(memberPeerId)?.displayName).toBe("Marcus");

    await storeA.close();
    await storeB.close();
  });

  it("rejects a tampered MemberClaim (bad signature)", async () => {
    const founderDir = await tmpDir();
    const founderTempPeerId = "f".repeat(64);
    const storeA = await openAutobeeStore({
      rootDir: founderDir,
      founderPeerId: founderTempPeerId,
      role: "admin",
    });
    const founderPeerId = storeA.localPeerId;
    const founderMember = {
      id: newUlid(),
      kind: "member" as const,
      peerId: founderPeerId,
      displayName: "Sarah",
      role: "admin" as const,
      admittedBy: founderPeerId,
      admittedAt: "2026-05-26T10:00:00.000Z",
      publicKey: founderPeerId,
    };
    await storeA.append({
      kind: "member",
      key: `member/${founderPeerId}`,
      value: {
        ...founderMember,
        sig: signCanonical(founderMember, storeA.secretKey),
      },
    });
    await storeA.flush();

    // Adversary: signs the claim with the WRONG key (a key the admin doesn't recognize)
    const wrongKeys = crypto.keyPair();
    const wrongPeerId = b4a.toString(wrongKeys.publicKey, "hex");
    const claimBody = {
      v: 1 as const,
      vaultId: newUlid(),
      peerId: wrongPeerId,
      publicKey: founderPeerId, // claims to be the founder!
      displayName: "Imposter",
      ts: "2026-05-26T10:01:00.000Z",
    };
    const badClaim = {
      ...claimBody,
      sig: signCanonical(claimBody, wrongKeys.secretKey), // signed by wrong key
    };

    const { a, b } = makePair();
    wireRpc(a, async (method, params) => {
      if (method !== "member.claim") return { ok: false };
      const claim = params as typeof badClaim;
      const { sig, ...rest } = claim;
      const ok = verifyCanonical(rest, sig, b4a.from(claim.publicKey, "hex"));
      return { ok };
    });
    const bSession = wireRpc(b, async () => ({ ok: false }));

    const reply = (await bSession.request("member.claim", badClaim)) as {
      ok: boolean;
    };
    expect(reply.ok).toBe(false);

    // Roster should still be just the founder
    const roster = await loadRoster(storeA.view);
    expect(roster.size).toBe(1);
    expect(roster.has(wrongPeerId)).toBe(false);

    await storeA.close();
  });
});
