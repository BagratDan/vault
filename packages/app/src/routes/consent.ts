import crypto from "node:crypto";
import { newUlid, type ConsentEvent } from "@vault/domain";
import {
  isScopeAllowed,
  type ConsentRequest,
  type ConsentResponse,
  type Scope,
  type SwarmTransport,
  type AuditLog,
  type Repo,
} from "@vault/sync";
import type { ConsentState, PendingEntry } from "../consent-state.js";

export interface ConsentDeps {
  swarm: SwarmTransport | null;
  consentState: ConsentState;
  audit: AuditLog;
  getRepo: () => Repo;
  selfPeerId: string;
  selfDisplayName: string;
}

// ── consent.request (requester side) ────────────────────────────────────

export interface ConsentRequestInput {
  memoryId: string;
  ownerPeerId: string;
  scope: Scope;
}

export interface ConsentRequestResult {
  consentRequestId: string;
  status: "pending" | "expired";
  reason?: string;
}

export async function consentRequest(
  deps: ConsentDeps,
  input: ConsentRequestInput
): Promise<ConsentRequestResult> {
  const consentRequestId = newUlid();
  const ts = new Date().toISOString();

  await writeAudit(deps.audit, {
    requesterPeerId: deps.selfPeerId,
    ownerPeerId: input.ownerPeerId,
    resourceId: input.memoryId,
    kind: "request",
  });

  if (!deps.swarm || !deps.swarm.listConnectedPeers().includes(input.ownerPeerId)) {
    await writeAudit(deps.audit, {
      requesterPeerId: deps.selfPeerId,
      ownerPeerId: input.ownerPeerId,
      resourceId: input.memoryId,
      kind: "expire",
    });
    return { consentRequestId, status: "expired", reason: "owner-offline" };
  }

  const wireReq: ConsentRequest = {
    v: 1,
    method: "consent.request",
    consentRequestId,
    memoryId: input.memoryId,
    scope: input.scope,
    requesterDisplayName: deps.selfDisplayName,
    ts,
  };
  try {
    await deps.swarm.sendConsent(input.ownerPeerId, wireReq);
  } catch (err) {
    await writeAudit(deps.audit, {
      requesterPeerId: deps.selfPeerId,
      ownerPeerId: input.ownerPeerId,
      resourceId: input.memoryId,
      kind: "expire",
    });
    return {
      consentRequestId,
      status: "expired",
      reason: err instanceof Error ? err.message : "send-failed",
    };
  }
  return { consentRequestId, status: "pending" };
}

// ── consent.respond (owner side) ────────────────────────────────────────

export type RespondDecision =
  | "approve-snippet"
  | "approve-file"
  | "approve-metadata"
  | "deny";

export interface ConsentRespondInput {
  consentRequestId: string;
  decision: RespondDecision;
}

export interface ConsentRespondResult {
  status: "ok" | "already-handled";
}

export async function consentRespond(
  deps: ConsentDeps,
  input: ConsentRespondInput
): Promise<ConsentRespondResult> {
  const entry = deps.consentState.get(input.consentRequestId);
  if (!entry) return { status: "already-handled" };

  if (input.decision === "deny") {
    await sendDeny(deps, entry, "user-denied");
    deps.consentState.delete(input.consentRequestId);
    return { status: "ok" };
  }

  const requestedScope = decisionToScope(input.decision);
  const memory = await deps.getRepo().getMemory(entry.memoryId as never);
  if (!memory) {
    await sendDeny(deps, entry, "memory-not-found");
    deps.consentState.delete(input.consentRequestId);
    return { status: "ok" };
  }
  if (!isScopeAllowed(memory.requestableScopes, requestedScope)) {
    await sendDeny(deps, entry, "scope-not-permitted");
    deps.consentState.delete(input.consentRequestId);
    return { status: "ok" };
  }

  const payload = buildPayload(memory, requestedScope);
  const wireRes: ConsentResponse = {
    v: 1,
    method: "consent.response",
    consentRequestId: entry.consentRequestId,
    kind: "approve",
    scope: requestedScope,
    payload,
  };
  if (deps.swarm) {
    try {
      await deps.swarm.sendConsent(entry.requesterPeerId, wireRes);
    } catch {
      // Best-effort. Owner has decided; audit the decision regardless.
    }
  }

  await writeAudit(deps.audit, {
    requesterPeerId: entry.requesterPeerId,
    ownerPeerId: deps.selfPeerId,
    resourceId: entry.memoryId,
    kind: decisionToAuditKind(input.decision),
    payloadHash: hashPayload(payload),
    byteCount: estimateBytes(payload),
  });
  deps.consentState.delete(input.consentRequestId);
  return { status: "ok" };
}

// ── consent.list-pending ────────────────────────────────────────────────

export function consentListPending(deps: ConsentDeps): readonly PendingEntry[] {
  return deps.consentState.list();
}

// ── helpers ─────────────────────────────────────────────────────────────

function decisionToScope(decision: Exclude<RespondDecision, "deny">): Scope {
  if (decision === "approve-snippet") return "snippet";
  if (decision === "approve-file") return "file";
  return "metadata";
}

function decisionToAuditKind(decision: RespondDecision): ConsentEvent["kind"] {
  if (decision === "deny") return "deny";
  if (decision === "approve-snippet") return "approve-snippet";
  if (decision === "approve-file") return "approve-file";
  return "approve-metadata";
}

function buildPayload(
  memory: { body: string; tags: string[]; createdAt: string },
  scope: Scope
): Record<string, unknown> {
  if (scope === "metadata") {
    return { tags: memory.tags, createdAt: memory.createdAt };
  }
  if (scope === "snippet") {
    return { text: memory.body };
  }
  const bytes = Buffer.from(memory.body, "utf8");
  return {
    contentBase64: bytes.toString("base64"),
    mime: "text/plain",
    size: bytes.byteLength,
    hash: hashPayload({ body: memory.body }),
  };
}

async function sendDeny(
  deps: ConsentDeps,
  entry: PendingEntry,
  reason: string
): Promise<void> {
  if (deps.swarm) {
    const wire: ConsentResponse = {
      v: 1,
      method: "consent.response",
      consentRequestId: entry.consentRequestId,
      kind: "deny",
      reason,
    };
    try {
      await deps.swarm.sendConsent(entry.requesterPeerId, wire);
    } catch {
      // Best-effort
    }
  }
  await writeAudit(deps.audit, {
    requesterPeerId: entry.requesterPeerId,
    ownerPeerId: deps.selfPeerId,
    resourceId: entry.memoryId,
    kind: "deny",
  });
}

function hashPayload(payload: unknown): string {
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}

function estimateBytes(payload: unknown): number {
  return Buffer.byteLength(JSON.stringify(payload), "utf8");
}

async function writeAudit(
  audit: AuditLog,
  partial: {
    requesterPeerId: string;
    ownerPeerId: string;
    resourceId: string;
    kind: ConsentEvent["kind"];
    payloadHash?: string;
    byteCount?: number;
  }
): Promise<void> {
  const now = new Date().toISOString();
  await audit.append({
    id: newUlid(),
    createdAt: now,
    updatedAt: now,
    ownerPeerId: partial.ownerPeerId,
    provenance: { kind: "user" },
    requesterPeerId: partial.requesterPeerId,
    resourceId: partial.resourceId,
    kind: partial.kind,
    ...(partial.payloadHash ? { payloadHash: partial.payloadHash } : {}),
    ...(partial.byteCount !== undefined ? { byteCount: partial.byteCount } : {}),
  } as ConsentEvent);
}
