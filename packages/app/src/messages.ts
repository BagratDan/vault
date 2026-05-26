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

export const clientMessageShape = z.discriminatedUnion("kind", [
  captureText,
  captureAudio,
  searchRun,
  memoryGet,
  ttsPlay,
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

export const serverMessageShape = z.discriminatedUnion("kind", [
  captureAck,
  searchHits,
  answerChunk,
  answerDone,
  ttsChunk,
  ttsDone,
  errorMsg,
]);
export type ServerMessage = z.infer<typeof serverMessageShape>;
