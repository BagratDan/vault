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
  | { kind: "peer.list" };

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
  | { kind: "peer.disconnected"; peerId: string };
