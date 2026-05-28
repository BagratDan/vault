// Hand-mirrored protocol types matching @vault/app/src/messages.ts.
// We avoid depending on @vault/app at runtime so Vite doesn't try to
// bundle its Node-only transitive deps (Hyperbee, @qvac/sdk, etc.).

export interface RelEdge { relId: string; toId?: string; fromId?: string; type: string }

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
      folderIds?: string[];
    }
  | { kind: "memory.get"; memoryId: string }
  | { kind: "memory.detail-get"; memoryId: string }
  | { kind: "memory.list"; limit?: number }
  | { kind: "memory.reindex" }
  | { kind: "entity.list"; entityKind: "person" | "place" | "event" | "task" }
  | { kind: "entity.get"; entityKind: "person" | "place" | "event" | "task"; id: string }
  | { kind: "relationship.list"; recordId: string; direction?: "from" | "to" | "both" }
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
    }
  | { kind: "folder.add"; path: string; displayName: string; visibility: "public" | "private" }
  | { kind: "folder.list" }
  | { kind: "folder.update"; folderId: string; visibility?: "public" | "private"; displayName?: string }
  | { kind: "folder.delete"; folderId: string }
  | { kind: "folder.rescan"; folderId: string };

export interface Hit {
  memoryId: string;
  score: number;
  snippet: string;
  ownerPeerId?: string;
  tags: string[];
  folderId?: string;
}

export interface Citation {
  memoryId: string;
  ownerPeerId?: string;
}

export type ServerMessage =
  | { kind: "capture.ack"; memoryId: string; duplicateOf?: string }
  | { kind: "search.hits"; hits: Hit[] }
  | {
      kind: "memory.list";
      memories: Array<{
        memoryId: string;
        summary: string;
        body: string;
        tags: string[];
        createdAt: string;
        ownerPeerId: string;
        confidence: number;
        folderId: string;
      }>;
    }
  | {
      kind: "memory.detail";
      memory: {
        memoryId: string;
        summary: string;
        body: string;
        tags: string[];
        createdAt: string;
        ownerPeerId: string;
        confidence: number;
        folderId: string;
      } | null;
    }
  | { kind: "memory.reindex"; memories: number; embedded: number; errors: number }
  | { kind: "entity.results"; entityKind: "person" | "place" | "event" | "task"; items: Array<Record<string, unknown>> }
  | { kind: "entity.detail"; entityKind: "person" | "place" | "event" | "task"; record: Record<string, unknown> | null; from: RelEdge[]; to: RelEdge[] }
  | { kind: "relationship.results"; recordId: string; from: RelEdge[]; to: RelEdge[] }
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
  | { kind: "admin.revoke-ack"; targetPeerId: string }
  | { kind: "folder.list"; folders: Array<{ folderId: string; displayName: string; visibility: "public" | "private"; ownerPeerId: string; fileCount: number; createdAt: string; path?: string }> }
  | { kind: "folder.added"; folderId: string; displayName: string }
  | { kind: "folder.ingest-progress"; folderId: string; current: number; total: number; phase: "scanning" | "extracting" | "embedding" | "done"; currentFile?: string }
  | { kind: "folder.ingest-done"; folderId: string; ingested: number; skipped: number; errors: number }
  | { kind: "folder.updated"; folderId: string }
  | { kind: "folder.deleted"; folderId: string };
