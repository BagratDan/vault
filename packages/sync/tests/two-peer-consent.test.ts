/**
 * Two-peer consent happy path (in-memory transport).
 *
 * Exercises Plan 3's consent contract end-to-end:
 *   1. Marcus's session sends consent.request to Sarah
 *   2. Sarah's handler audits the request, auto-approves snippet, and
 *      sends consent.response with the snippet payload
 *   3. Sarah's handler audits the matching approve-snippet event
 *   4. Marcus's handler receives the payload and audits its own
 *      approve-snippet event
 *
 * Both peers end up with two ConsentEvent rows in their audit log:
 * [request, approve-snippet].
 */
import { describe, expect, it, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { wireRpc, type DuplexLike, type RpcSession } from "../src/swarm.js";
import { AuditLog } from "../src/audit.js";
import {
  type ConsentRequest,
  type ConsentResponse,
} from "../src/consent-protocol.js";
import { newUlid } from "@vault/domain";

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

async function tmpDir(prefix: string): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  dirs.push(d);
  return d;
}

const MARCUS = "a".repeat(64);
const SARAH = "b".repeat(64);
const MEMORY_ID = "01J0ABCDEFGHJKMNPQRSTV0001";

describe("two-peer consent (happy path)", () => {
  it("request → approve-snippet → both peers audit the transaction", async () => {
    const dirA = await tmpDir("vault-consent-A-");
    const dirB = await tmpDir("vault-consent-B-");
    const auditA = new AuditLog(dirA);
    const auditB = new AuditLog(dirB);
    await auditA.ready();
    await auditB.ready();

    const { a, b } = makePair();
    let grantedPayload: unknown = null;

    const sarahSession: RpcSession = wireRpc(a, async (method, params) => {
      if (method === "consent.request") {
        const req = params as ConsentRequest;
        const now = new Date().toISOString();
        await auditA.append({
          id: newUlid(),
          createdAt: now,
          updatedAt: now,
          ownerPeerId: SARAH,
          provenance: { kind: "user" },
          requesterPeerId: MARCUS,
          resourceId: req.memoryId,
          kind: "request",
        });
        const resp: ConsentResponse = {
          v: 1,
          method: "consent.response",
          consentRequestId: req.consentRequestId,
          kind: "approve",
          scope: "snippet",
          payload: { text: "indemnification clause from Acme MSA 2025" },
        };
        await sarahSession.request("consent.response", resp);
        await auditA.append({
          id: newUlid(),
          createdAt: now,
          updatedAt: now,
          ownerPeerId: SARAH,
          provenance: { kind: "user" },
          requesterPeerId: MARCUS,
          resourceId: req.memoryId,
          kind: "approve-snippet",
        });
        return { ok: true };
      }
      return { ok: false };
    });

    const marcusSession: RpcSession = wireRpc(b, async (method, params) => {
      if (method === "consent.response") {
        const res = params as ConsentResponse;
        if (res.kind === "approve") {
          grantedPayload = res.payload;
          const now = new Date().toISOString();
          await auditB.append({
            id: newUlid(),
            createdAt: now,
            updatedAt: now,
            ownerPeerId: SARAH,
            provenance: { kind: "user" },
            requesterPeerId: MARCUS,
            resourceId: MEMORY_ID,
            kind: "approve-snippet",
          });
        }
        return { ok: true };
      }
      return { ok: false };
    });

    const consentRequestId = newUlid();
    const requestTs = new Date().toISOString();
    await auditB.append({
      id: newUlid(),
      createdAt: requestTs,
      updatedAt: requestTs,
      ownerPeerId: SARAH,
      provenance: { kind: "user" },
      requesterPeerId: MARCUS,
      resourceId: MEMORY_ID,
      kind: "request",
    });
    const req: ConsentRequest = {
      v: 1,
      method: "consent.request",
      consentRequestId,
      memoryId: MEMORY_ID,
      scope: "snippet",
      requesterDisplayName: "Marcus",
      ts: requestTs,
    };
    await marcusSession.request("consent.request", req);

    expect(grantedPayload).toEqual({
      text: "indemnification clause from Acme MSA 2025",
    });

    const sarahEvents: unknown[] = [];
    for await (const e of auditA.list()) sarahEvents.push(e);
    expect(sarahEvents).toHaveLength(2);

    const marcusEvents: unknown[] = [];
    for await (const e of auditB.list()) marcusEvents.push(e);
    expect(marcusEvents).toHaveLength(2);

    await auditA.close();
    await auditB.close();
  });
});
