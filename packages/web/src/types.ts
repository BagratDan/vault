// Hand-mirrored protocol types matching @vault/app/src/messages.ts.
// We avoid depending on @vault/app at runtime so Vite doesn't try to
// bundle its Node-only transitive deps (Hyperbee, @qvac/sdk, etc.).

export type ClientMessage =
  | { kind: "capture.text"; text: string; tags: string[] }
  | { kind: "capture.audio"; audioBase64: string; tags: string[] }
  | {
      kind: "search.run";
      query: string;
      k: number;
      filters?: {
        tags?: string[];
        createdAfter?: string;
        createdBefore?: string;
        personId?: string;
      };
    }
  | { kind: "memory.get"; memoryId: string }
  | { kind: "tts.play"; text: string; requestId: string }
  | { kind: "vault.status" }
  | { kind: "vault.create"; displayName: string }
  | { kind: "vault.invite-create"; placeholderDisplayName?: string; expiresIn?: string }
  | { kind: "vault.invite-accept"; token: string; displayName: string }
  | { kind: "peer.list" }
  | {
      kind: "consent.request";
      memoryId: string;
      ownerPeerId: string;
      scope: "metadata" | "snippet" | "file";
    }
  | {
      kind: "consent.respond";
      consentRequestId: string;
      decision: "approve-snippet" | "approve-file" | "approve-metadata" | "deny";
    }
  | { kind: "consent.list-pending" }
  | { kind: "audit.query"; peerId?: string; since?: string; limit?: number }
  | { kind: "admin.member-list" }
  | { kind: "admin.revoke-member"; targetPeerId: string; reason?: string }
  | {
      kind: "memory.update-scopes";
      memoryId: string;
      requestableScopes: Array<"metadata" | "snippet" | "file">;
    };

export interface Hit {
  memoryId: string;
  score: number;
  snippet: string;
  ownerPeerId?: string;
  tags: string[];
}

export interface Citation {
  memoryId: string;
  ownerPeerId?: string;
}

export type ServerMessage =
  | { kind: "capture.ack"; memoryId: string; duplicateOf?: string }
  | { kind: "search.hits"; hits: Hit[] }
  | { kind: "answer.chunk"; requestId: string; text: string }
  | { kind: "answer.done"; requestId: string; citations: Citation[] }
  | { kind: "tts.chunk"; requestId: string; audioBase64: string }
  | { kind: "tts.done"; requestId: string }
  | { kind: "error"; requestId?: string; code: string; message: string }
  | { kind: "vault.status"; state: "no-vault" | "admin" | "member"; vaultId?: string; vaultName?: string; selfPeerId?: string }
  | { kind: "vault.created"; vaultId: string; peerId: string }
  | { kind: "vault.joined"; vaultId: string; peerId: string }
  | { kind: "invite.token"; token: string; expiresAt: string }
  | { kind: "peer.list"; peers: Array<{ peerId: string; displayName: string; role: "admin" | "member" }> }
  | { kind: "peer.connected"; peer: { peerId: string; displayName: string } }
  | { kind: "peer.disconnected"; peerId: string }
  | { kind: "consent.pending"; consentRequestId: string }
  | {
      kind: "consent.incoming";
      consentRequestId: string;
      requesterPeerId: string;
      requesterDisplayName: string;
      memoryId: string;
      memoryTitle: string;
      scope: "metadata" | "snippet" | "file";
      ratePolicy?: "normal" | "warned" | "paused";
      expiresAt: number;
    }
  | {
      kind: "consent.granted";
      consentRequestId: string;
      scope: "metadata" | "snippet" | "file";
      payload: unknown;
    }
  | { kind: "consent.denied"; consentRequestId: string; reason?: string }
  | { kind: "consent.expired"; consentRequestId: string; reason?: string }
  | { kind: "audit.events"; events: unknown[] }
  | {
      kind: "admin.member-list";
      members: Array<{
        peerId: string;
        displayName: string;
        role: "admin" | "member";
        admittedAt?: string;
        revoked?: { at: string; reason?: string };
      }>;
    }
  | { kind: "admin.revoke-ack"; targetPeerId: string };
