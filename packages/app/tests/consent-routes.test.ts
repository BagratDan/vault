import { describe, expect, it } from "vitest";
import { consentRequest, consentRespond, type ConsentDeps } from "../src/routes/consent.js";
import { ConsentState } from "../src/consent-state.js";

const PK_A = "a".repeat(64);
const PK_B = "b".repeat(64);
const MEM_ID = "01J0ABCDEFGHJKMNPQRSTV0001";

function makeDeps(opts: {
  connectedPeers?: string[];
  memory?: { body: string; tags: string[]; requestableScopes: ("metadata" | "snippet" | "file")[]; createdAt: string } | null;
  sendConsentImpl?: (peerId: string, payload: unknown) => Promise<void>;
}): { deps: ConsentDeps; appended: unknown[]; sent: Array<{ peerId: string; payload: unknown }> } {
  const appended: unknown[] = [];
  const sent: Array<{ peerId: string; payload: unknown }> = [];
  const audit = {
    append: async (e: unknown) => { appended.push(e); },
  } as unknown as ConsentDeps["audit"];
  const swarm = {
    listConnectedPeers: () => opts.connectedPeers ?? [],
    sendConsent: opts.sendConsentImpl ?? (async (peerId: string, payload: unknown) => {
      sent.push({ peerId, payload });
    }),
  } as unknown as ConsentDeps["swarm"];
  const consentState = new ConsentState({ tickMs: 1_000_000 }); // effectively disabled
  const repo = {
    getMemory: async () => opts.memory ?? null,
  } as unknown as ReturnType<ConsentDeps["getRepo"]>;
  const deps: ConsentDeps = {
    swarm,
    consentState,
    audit,
    getRepo: () => repo,
    selfPeerId: PK_A,
    selfDisplayName: "Marcus",
  };
  return { deps, appended, sent };
}

describe("consentRequest", () => {
  it("expires immediately when owner is offline", async () => {
    const { deps, appended } = makeDeps({ connectedPeers: [] });
    const res = await consentRequest(deps, { memoryId: MEM_ID, ownerPeerId: PK_B, scope: "snippet" });
    expect(res.status).toBe("expired");
    expect(res.reason).toBe("owner-offline");
    expect(appended).toHaveLength(2); // request + expire
    deps.consentState.dispose();
  });

  it("sends a ConsentRequest when owner is connected", async () => {
    const { deps, appended, sent } = makeDeps({ connectedPeers: [PK_B] });
    const res = await consentRequest(deps, { memoryId: MEM_ID, ownerPeerId: PK_B, scope: "snippet" });
    expect(res.status).toBe("pending");
    expect(sent).toHaveLength(1);
    expect((sent[0]!.payload as { method: string }).method).toBe("consent.request");
    expect(appended).toHaveLength(1); // request only
    deps.consentState.dispose();
  });

  it("audits an expire when sendConsent throws", async () => {
    const { deps, appended } = makeDeps({
      connectedPeers: [PK_B],
      sendConsentImpl: async () => { throw new Error("boom"); },
    });
    const res = await consentRequest(deps, { memoryId: MEM_ID, ownerPeerId: PK_B, scope: "snippet" });
    expect(res.status).toBe("expired");
    expect(res.reason).toBe("boom");
    expect(appended).toHaveLength(2);
    deps.consentState.dispose();
  });
});

describe("consentRespond", () => {
  it("returns already-handled when the entry is gone", async () => {
    const { deps } = makeDeps({});
    const res = await consentRespond(deps, { consentRequestId: "missing", decision: "deny" });
    expect(res.status).toBe("already-handled");
    deps.consentState.dispose();
  });

  it("deny path sends a deny and audits", async () => {
    const { deps, appended, sent } = makeDeps({ connectedPeers: [PK_B] });
    deps.consentState.set({
      consentRequestId: "01J0CCCCCCCCCCCCCCCCCCCCCC",
      requesterPeerId: PK_B,
      ownerPeerId: PK_A,
      memoryId: MEM_ID,
      scope: "snippet",
      requesterDisplayName: "Marcus",
      requestedAt: "2026-05-26T10:00:00.000Z",
    });
    const res = await consentRespond(deps, {
      consentRequestId: "01J0CCCCCCCCCCCCCCCCCCCCCC",
      decision: "deny",
    });
    expect(res.status).toBe("ok");
    expect(sent[0]?.payload).toMatchObject({ method: "consent.response", kind: "deny" });
    expect(appended).toHaveLength(1);
    expect((appended[0] as { kind: string }).kind).toBe("deny");
    expect(deps.consentState.has("01J0CCCCCCCCCCCCCCCCCCCCCC")).toBe(false);
    deps.consentState.dispose();
  });

  it("scope-ceiling violation → deny with scope-not-permitted", async () => {
    const { deps, sent } = makeDeps({
      connectedPeers: [PK_B],
      memory: { body: "secret", tags: [], requestableScopes: ["metadata"], createdAt: "2026-05-26T10:00:00.000Z" },
    });
    deps.consentState.set({
      consentRequestId: "01J0DDDDDDDDDDDDDDDDDDDDDD",
      requesterPeerId: PK_B,
      ownerPeerId: PK_A,
      memoryId: MEM_ID,
      scope: "snippet",
      requesterDisplayName: "Marcus",
      requestedAt: "2026-05-26T10:00:00.000Z",
    });
    const res = await consentRespond(deps, {
      consentRequestId: "01J0DDDDDDDDDDDDDDDDDDDDDD",
      decision: "approve-snippet",
    });
    expect(res.status).toBe("ok");
    expect(sent[0]?.payload).toMatchObject({ kind: "deny", reason: "scope-not-permitted" });
    deps.consentState.dispose();
  });

  it("approve-snippet path sends the body and audits with hash + byteCount", async () => {
    const { deps, appended, sent } = makeDeps({
      connectedPeers: [PK_B],
      memory: { body: "indemnification clause", tags: [], requestableScopes: ["metadata", "snippet", "file"], createdAt: "2026-05-26T10:00:00.000Z" },
    });
    deps.consentState.set({
      consentRequestId: "01J0EEEEEEEEEEEEEEEEEEEEEE",
      requesterPeerId: PK_B,
      ownerPeerId: PK_A,
      memoryId: MEM_ID,
      scope: "snippet",
      requesterDisplayName: "Marcus",
      requestedAt: "2026-05-26T10:00:00.000Z",
    });
    const res = await consentRespond(deps, {
      consentRequestId: "01J0EEEEEEEEEEEEEEEEEEEEEE",
      decision: "approve-snippet",
    });
    expect(res.status).toBe("ok");
    expect(sent[0]?.payload).toMatchObject({ kind: "approve", scope: "snippet" });
    expect(((sent[0]?.payload as { payload: { text: string } }).payload).text).toBe("indemnification clause");
    const ev = appended[0] as { kind: string; payloadHash: string; byteCount: number };
    expect(ev.kind).toBe("approve-snippet");
    expect(ev.payloadHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(ev.byteCount).toBeGreaterThan(0);
    deps.consentState.dispose();
  });
});
