import { z } from "zod";

// Client → Server
const captureText = z.object({
  kind: z.literal("capture.text"),
  text: z.string().min(1),
  tags: z.array(z.string()),
});

const captureAudio = z.object({
  kind: z.literal("capture.audio"),
  audioBase64: z.string().min(1),
  tags: z.array(z.string()),
});

const searchRun = z.object({
  kind: z.literal("search.run"),
  query: z.string().min(1),
  k: z.number().int().positive(),
  filters: z
    .object({
      tags: z.array(z.string()).optional(),
      createdAfter: z.string().optional(),
      createdBefore: z.string().optional(),
      personId: z.string().optional(),
    })
    .optional(),
  folderIds: z.array(z.string()).optional(),
});

const memoryGet = z.object({
  kind: z.literal("memory.get"),
  memoryId: z.string(),
});

const memoryList = z.object({
  kind: z.literal("memory.list"),
  limit: z.number().int().positive().optional(),
});

const memoryReindexSchema = z.object({ kind: z.literal("memory.reindex") });

const ttsPlay = z.object({
  kind: z.literal("tts.play"),
  text: z.string().min(1),
  requestId: z.string(),
});

const vaultStatus = z.object({ kind: z.literal("vault.status") });

const vaultCreate = z.object({
  kind: z.literal("vault.create"),
  displayName: z.string().min(1),
});

const vaultInviteCreate = z.object({
  kind: z.literal("vault.invite-create"),
  placeholderDisplayName: z.string().optional(),
  expiresIn: z.string().optional(), // e.g. "7d", "24h"
});

const vaultInviteAccept = z.object({
  kind: z.literal("vault.invite-accept"),
  token: z.string().min(1),
  displayName: z.string().min(1),
});

const peerListReq = z.object({ kind: z.literal("peer.list") });

const consentRequestSchema = z.object({
  kind: z.literal("consent.request"),
  memoryId: z.string().min(1),
  ownerPeerId: z.string().min(1),
  scope: z.enum(["metadata", "snippet", "file"]),
});
const consentRespondSchema = z.object({
  kind: z.literal("consent.respond"),
  consentRequestId: z.string().min(1),
  decision: z.enum(["approve-snippet", "approve-file", "approve-metadata", "deny"]),
});
const consentListPendingSchema = z.object({
  kind: z.literal("consent.list-pending"),
});
const auditQuerySchema = z.object({
  kind: z.literal("audit.query"),
  peerId: z.string().optional(),
  since: z.string().optional(),
  limit: z.number().int().positive().optional(),
});
const adminMemberListSchema = z.object({ kind: z.literal("admin.member-list") });
const adminRevokeMemberSchema = z.object({
  kind: z.literal("admin.revoke-member"),
  targetPeerId: z.string().min(1),
  reason: z.string().optional(),
});
const memoryUpdateScopesSchema = z.object({
  kind: z.literal("memory.update-scopes"),
  memoryId: z.string().min(1),
  requestableScopes: z.array(z.enum(["metadata", "snippet", "file"])).min(1),
});

const folderAddSchema = z.object({
  kind: z.literal("folder.add"),
  path: z.string().min(1),
  displayName: z.string().min(1),
  visibility: z.enum(["public", "private"]),
});
const folderListReqSchema = z.object({ kind: z.literal("folder.list") });
const folderUpdateSchema = z.object({
  kind: z.literal("folder.update"),
  folderId: z.string().min(1),
  visibility: z.enum(["public", "private"]).optional(),
  displayName: z.string().min(1).optional(),
});
const folderDeleteSchema = z.object({
  kind: z.literal("folder.delete"),
  folderId: z.string().min(1),
});
const folderRescanSchema = z.object({
  kind: z.literal("folder.rescan"),
  folderId: z.string().min(1),
});

export const clientMessageShape = z.discriminatedUnion("kind", [
  captureText,
  captureAudio,
  searchRun,
  memoryGet,
  memoryList,
  memoryReindexSchema,
  ttsPlay,
  vaultStatus,
  vaultCreate,
  vaultInviteCreate,
  vaultInviteAccept,
  peerListReq,
  consentRequestSchema,
  consentRespondSchema,
  consentListPendingSchema,
  auditQuerySchema,
  adminMemberListSchema,
  adminRevokeMemberSchema,
  memoryUpdateScopesSchema,
  folderAddSchema,
  folderListReqSchema,
  folderUpdateSchema,
  folderDeleteSchema,
  folderRescanSchema,
]);
export type ClientMessage = z.infer<typeof clientMessageShape>;

// Server → Client
const captureAck = z.object({
  kind: z.literal("capture.ack"),
  memoryId: z.string(),
  duplicateOf: z.string().optional(),
});

const searchHits = z.object({
  kind: z.literal("search.hits"),
  hits: z.array(
    z.object({
      memoryId: z.string(),
      score: z.number(),
      snippet: z.string(),
      ownerPeerId: z.string().optional(),
      tags: z.array(z.string()),
      folderId: z.string().optional(),
    })
  ),
});

const memoryListReply = z.object({
  kind: z.literal("memory.list"),
  memories: z.array(
    z.object({
      memoryId: z.string(),
      summary: z.string(),
      body: z.string(),
      tags: z.array(z.string()),
      createdAt: z.string(),
      ownerPeerId: z.string(),
      confidence: z.number(),
      folderId: z.string(),
    })
  ),
});

const memoryReindexReply = z.object({
  kind: z.literal("memory.reindex"),
  memories: z.number().int().nonnegative(),
  embedded: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
});

const answerChunk = z.object({
  kind: z.literal("answer.chunk"),
  requestId: z.string(),
  text: z.string(),
});

const answerDone = z.object({
  kind: z.literal("answer.done"),
  requestId: z.string(),
  citations: z.array(
    z.object({ memoryId: z.string(), ownerPeerId: z.string().optional() })
  ),
});

const ttsChunk = z.object({
  kind: z.literal("tts.chunk"),
  requestId: z.string(),
  audioBase64: z.string(),
});

const ttsDone = z.object({
  kind: z.literal("tts.done"),
  requestId: z.string(),
});

const errorMsg = z.object({
  kind: z.literal("error"),
  requestId: z.string().optional(),
  code: z.string(),
  message: z.string(),
});

const vaultStatusReply = z.object({
  kind: z.literal("vault.status"),
  state: z.enum(["no-vault", "admin", "member"]),
  vaultId: z.string().optional(),
  vaultName: z.string().optional(),
  selfPeerId: z.string().optional(),
});

const vaultCreated = z.object({
  kind: z.literal("vault.created"),
  vaultId: z.string(),
  peerId: z.string(),
});

const vaultJoined = z.object({
  kind: z.literal("vault.joined"),
  vaultId: z.string(),
  peerId: z.string(),
});

const inviteToken = z.object({
  kind: z.literal("invite.token"),
  token: z.string(),
  expiresAt: z.string(),
});

const peerListReply = z.object({
  kind: z.literal("peer.list"),
  peers: z.array(
    z.object({
      peerId: z.string(),
      displayName: z.string(),
      role: z.enum(["admin", "member"]),
    })
  ),
});

const peerConnected = z.object({
  kind: z.literal("peer.connected"),
  peer: z.object({ peerId: z.string(), displayName: z.string() }),
});

const peerDisconnected = z.object({
  kind: z.literal("peer.disconnected"),
  peerId: z.string(),
});

const consentPendingReply = z.object({
  kind: z.literal("consent.pending"),
  consentRequestId: z.string(),
});
const consentIncomingReply = z.object({
  kind: z.literal("consent.incoming"),
  consentRequestId: z.string(),
  requesterPeerId: z.string(),
  requesterDisplayName: z.string(),
  memoryId: z.string(),
  memoryTitle: z.string(),
  scope: z.enum(["metadata", "snippet", "file"]),
  ratePolicy: z.enum(["normal", "warned", "paused"]).optional(),
  expiresAt: z.number(),
});
const consentGrantedReply = z.object({
  kind: z.literal("consent.granted"),
  consentRequestId: z.string(),
  scope: z.enum(["metadata", "snippet", "file"]),
  payload: z.unknown(),
});
const consentDeniedReply = z.object({
  kind: z.literal("consent.denied"),
  consentRequestId: z.string(),
  reason: z.string().optional(),
});
const consentExpiredReply = z.object({
  kind: z.literal("consent.expired"),
  consentRequestId: z.string(),
  reason: z.string().optional(),
});
const auditEventsReply = z.object({
  kind: z.literal("audit.events"),
  events: z.array(z.unknown()),
});
const adminMemberListReply = z.object({
  kind: z.literal("admin.member-list"),
  members: z.array(
    z.object({
      peerId: z.string(),
      displayName: z.string(),
      role: z.enum(["admin", "member"]),
      admittedAt: z.string().optional(),
      revoked: z
        .object({ at: z.string(), reason: z.string().optional() })
        .optional(),
    })
  ),
});
const adminRevokeAckReply = z.object({
  kind: z.literal("admin.revoke-ack"),
  targetPeerId: z.string(),
});

const folderListReplySchema = z.object({
  kind: z.literal("folder.list"),
  folders: z.array(
    z.object({
      folderId: z.string(),
      displayName: z.string(),
      visibility: z.enum(["public", "private"]),
      ownerPeerId: z.string(),
      fileCount: z.number().int().nonnegative(),
      createdAt: z.string(),
      path: z.string().optional(),
    })
  ),
});
const folderAddedReplySchema = z.object({
  kind: z.literal("folder.added"),
  folderId: z.string(),
  displayName: z.string(),
});
const folderIngestProgressSchema = z.object({
  kind: z.literal("folder.ingest-progress"),
  folderId: z.string(),
  current: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  phase: z.enum(["scanning", "extracting", "embedding", "done"]),
  currentFile: z.string().optional(),
});
const folderIngestDoneSchema = z.object({
  kind: z.literal("folder.ingest-done"),
  folderId: z.string(),
  ingested: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
});
const folderUpdatedReplySchema = z.object({
  kind: z.literal("folder.updated"),
  folderId: z.string(),
});
const folderDeletedReplySchema = z.object({
  kind: z.literal("folder.deleted"),
  folderId: z.string(),
});

export const serverMessageShape = z.discriminatedUnion("kind", [
  captureAck,
  searchHits,
  memoryListReply,
  memoryReindexReply,
  answerChunk,
  answerDone,
  ttsChunk,
  ttsDone,
  errorMsg,
  vaultStatusReply,
  vaultCreated,
  vaultJoined,
  inviteToken,
  peerListReply,
  peerConnected,
  peerDisconnected,
  consentPendingReply,
  consentIncomingReply,
  consentGrantedReply,
  consentDeniedReply,
  consentExpiredReply,
  auditEventsReply,
  adminMemberListReply,
  adminRevokeAckReply,
  folderListReplySchema,
  folderAddedReplySchema,
  folderIngestProgressSchema,
  folderIngestDoneSchema,
  folderUpdatedReplySchema,
  folderDeletedReplySchema,
]);
export type ServerMessage = z.infer<typeof serverMessageShape>;
