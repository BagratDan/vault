/**
 * Two-peer consent — deny path + expire path.
 *
 * Deny: Marcus's session sends consent.request; Sarah denies; both peers
 * audit kind=deny.
 *
 * Expire: ConsentState fires its onExpire callback after the configured
 * deadline. Uses an inlined minimal ConsentState (mirroring
 * packages/app/src/consent-state.ts) so this test does not depend on
 * @vault/sync reaching across into @vault/app's source tree.
 */
import { describe, expect, it, afterEach, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { wireRpc, type DuplexLike, type RpcSession } from "../src/swarm.js";
import { AuditLog } from "../src/audit.js";
import {
  type ConsentRequest,
  type ConsentResponse,
  type Scope,
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

async function logRequest(audit: AuditLog) {
  const now = new Date().toISOString();
  await audit.append({
    id: newUlid(),
    createdAt: now,
    updatedAt: now,
    ownerPeerId: SARAH,
    provenance: { kind: "user" },
    requesterPeerId: MARCUS,
    resourceId: MEMORY_ID,
    kind: "request",
  });
}

// ── Inlined minimal ConsentState (mirrors packages/app/src/consent-state.ts)
// Kept local to avoid a cross-package source import from @vault/sync → @vault/app.

interface PendingEntry {
  consentRequestId: string;
  requesterPeerId: string;
  ownerPeerId: string;
  memoryId: string;
  scope: Scope;
  requesterDisplayName: string;
  requestedAt: string;
  expiresAt: number;
}

interface ConsentStateOpts {
  onExpire?: (consentRequestId: string) => void;
  expiryMs?: number;
  tickMs?: number;
}

class ConsentState {
  private readonly entries = new Map<string, PendingEntry>();
  private readonly expiryMs: number;
  private readonly onExpire?: (id: string) => void;
  private readonly tickHandle: ReturnType<typeof setInterval>;

  constructor(opts: ConsentStateOpts = {}) {
    this.expiryMs = opts.expiryMs ?? 5 * 60 * 1000;
    if (opts.onExpire) this.onExpire = opts.onExpire;
    this.tickHandle = setInterval(() => this.tick(), opts.tickMs ?? 1000);
  }

  set(input: Omit<PendingEntry, "expiresAt">): void {
    this.entries.set(input.consentRequestId, {
      ...input,
      expiresAt: Date.now() + this.expiryMs,
    });
  }

  private tick(): void {
    const now = Date.now();
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(id);
        this.onExpire?.(id);
      }
    }
  }

  dispose(): void {
    clearInterval(this.tickHandle);
    this.entries.clear();
  }
}

describe("two-peer consent (deny + expire)", () => {
  it("denies → both audits record kind=deny", async () => {
    const auditA = new AuditLog(await tmpDir("vault-consent-deny-A-"));
    const auditB = new AuditLog(await tmpDir("vault-consent-deny-B-"));
    await auditA.ready();
    await auditB.ready();

    const { a, b } = makePair();
    let deniedReason: string | undefined;

    const sarahSession: RpcSession = wireRpc(a, async (method, params) => {
      if (method !== "consent.request") return { ok: false };
      const req = params as ConsentRequest;
      await logRequest(auditA);
      const resp: ConsentResponse = {
        v: 1,
        method: "consent.response",
        consentRequestId: req.consentRequestId,
        kind: "deny",
        reason: "user-denied",
      };
      await sarahSession.request("consent.response", resp);
      const now = new Date().toISOString();
      await auditA.append({
        id: newUlid(),
        createdAt: now,
        updatedAt: now,
        ownerPeerId: SARAH,
        provenance: { kind: "user" },
        requesterPeerId: MARCUS,
        resourceId: req.memoryId,
        kind: "deny",
      });
      return { ok: true };
    });

    const marcusSession: RpcSession = wireRpc(b, async (method, params) => {
      if (method !== "consent.response") return { ok: false };
      const res = params as ConsentResponse;
      if (res.kind === "deny") {
        deniedReason = res.reason;
        const now = new Date().toISOString();
        await auditB.append({
          id: newUlid(),
          createdAt: now,
          updatedAt: now,
          ownerPeerId: SARAH,
          provenance: { kind: "user" },
          requesterPeerId: MARCUS,
          resourceId: MEMORY_ID,
          kind: "deny",
        });
      }
      return { ok: true };
    });

    await logRequest(auditB);
    const req: ConsentRequest = {
      v: 1,
      method: "consent.request",
      consentRequestId: newUlid(),
      memoryId: MEMORY_ID,
      scope: "snippet",
      requesterDisplayName: "Marcus",
      ts: new Date().toISOString(),
    };
    await marcusSession.request("consent.request", req);

    expect(deniedReason).toBe("user-denied");

    const sarahEvents: { kind: string }[] = [];
    for await (const e of auditA.list()) {
      sarahEvents.push(e as { kind: string });
    }
    expect(sarahEvents.map((e) => e.kind)).toEqual(["request", "deny"]);

    const marcusEvents: { kind: string }[] = [];
    for await (const e of auditB.list()) {
      marcusEvents.push(e as { kind: string });
    }
    expect(marcusEvents.map((e) => e.kind)).toEqual(["request", "deny"]);

    await auditA.close();
    await auditB.close();
  });

  it("expires → ConsentState fires onExpire after deadline", () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    const state = new ConsentState({ expiryMs: 50, tickMs: 10, onExpire });
    state.set({
      consentRequestId: newUlid(),
      requesterPeerId: MARCUS,
      ownerPeerId: SARAH,
      memoryId: MEMORY_ID,
      scope: "snippet",
      requesterDisplayName: "Marcus",
      requestedAt: new Date().toISOString(),
    });
    vi.advanceTimersByTime(100);
    expect(onExpire).toHaveBeenCalledTimes(1);
    state.dispose();
    vi.useRealTimers();
  });
});
