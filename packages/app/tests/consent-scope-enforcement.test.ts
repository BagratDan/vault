/**
 * Scope ceiling enforcement.
 *
 * When a requester asks for `file` scope but the memory's
 * requestableScopes only permits `metadata` and `snippet`, the owner-side
 * consentRespond must reject the approval with kind=deny + reason=scope-not-permitted,
 * audit the deny, and remove the pending entry.
 */
import { describe, expect, it, vi } from "vitest";
import { ConsentState } from "../src/consent-state.js";
import { consentRespond } from "../src/routes/consent.js";

describe("scope ceiling enforcement", () => {
  it("denies with scope-not-permitted when requested scope exceeds memory ceiling", async () => {
    const consentState = new ConsentState({ tickMs: 5_000_000 });
    const sent: unknown[] = [];
    const swarm = {
      listConnectedPeers: () => ["a".repeat(64)],
      sendConsent: async (_peerId: string, payload: unknown) => {
        sent.push(payload);
      },
    } as never;
    const audit = {
      append: vi.fn(async () => undefined),
    } as never;
    const memory = {
      id: "01J0ABCDEFGHJKMNPQRSTV0001",
      summary: "x",
      body: "y",
      tags: [],
      requestableScopes: ["metadata", "snippet"],
      createdAt: "2026-05-26T10:00:00.000Z",
    };
    const repo = { getMemory: async () => memory } as never;
    consentState.set({
      consentRequestId: "01J0ABCDEFGHJKMNPQRSTV0010",
      requesterPeerId: "a".repeat(64),
      ownerPeerId: "b".repeat(64),
      memoryId: memory.id,
      scope: "file",
      requesterDisplayName: "Marcus",
      requestedAt: "2026-05-26T10:00:00.000Z",
    });
    await consentRespond(
      {
        swarm,
        consentState,
        audit,
        getRepo: () => repo,
        selfPeerId: "b".repeat(64),
        selfDisplayName: "Sarah",
      },
      {
        consentRequestId: "01J0ABCDEFGHJKMNPQRSTV0010",
        decision: "approve-file",
      }
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      kind: "deny",
      reason: "scope-not-permitted",
    });
    expect((audit as never as { append: unknown }).append).toHaveBeenCalled();
    expect(consentState.has("01J0ABCDEFGHJKMNPQRSTV0010")).toBe(false);
    consentState.dispose();
  });
});
