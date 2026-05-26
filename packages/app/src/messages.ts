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
});

const memoryGet = z.object({
  kind: z.literal("memory.get"),
  memoryId: z.string(),
});

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

export const clientMessageShape = z.discriminatedUnion("kind", [
  captureText,
  captureAudio,
  searchRun,
  memoryGet,
  ttsPlay,
  vaultStatus,
  vaultCreate,
  vaultInviteCreate,
  vaultInviteAccept,
  peerListReq,
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
    })
  ),
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

export const serverMessageShape = z.discriminatedUnion("kind", [
  captureAck,
  searchHits,
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
]);
export type ServerMessage = z.infer<typeof serverMessageShape>;
