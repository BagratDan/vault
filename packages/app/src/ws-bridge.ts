import {
  clientMessageShape,
  type ClientMessage,
  type ServerMessage,
} from "./messages.js";
import type { CaptureDeps } from "./routes/capture.js";
import type { SearchDeps } from "./routes/search.js";
import type { MemoryDeps } from "./routes/memory.js";
import type { TtsDeps } from "./routes/tts.js";
import { captureText, captureAudio } from "./routes/capture.js";
import { runSearch } from "./routes/search.js";
import { getMemory } from "./routes/memory.js";
import { streamTts } from "./routes/tts.js";
import { complete, type ChatMessage } from "@vault/ai";
import { newUlid, type Ulid } from "@vault/domain";

export interface BridgeDeps extends CaptureDeps, SearchDeps, MemoryDeps, TtsDeps {}

export interface Conn {
  send(msg: ServerMessage): void;
}

interface SearchHitForAnswer {
  memoryId: string;
  snippet: string;
  ownerPeerId?: string;
}

export function makeRouter(deps: BridgeDeps) {
  return async function onMessage(raw: unknown, conn: Conn): Promise<ServerMessage> {
    const parsed = clientMessageShape.safeParse(raw);
    if (!parsed.success) {
      return {
        kind: "error",
        code: "invalid-message",
        message: parsed.error.message,
      };
    }
    const msg: ClientMessage = parsed.data;

    switch (msg.kind) {
      case "capture.text": {
        const r = await captureText(deps, { text: msg.text, tags: msg.tags });
        return {
          kind: "capture.ack",
          memoryId: r.memoryId,
          ...(r.duplicateOf ? { duplicateOf: r.duplicateOf } : {}),
        };
      }
      case "capture.audio": {
        const audio = Uint8Array.from(Buffer.from(msg.audioBase64, "base64"));
        const r = await captureAudio(deps, { audio, tags: msg.tags });
        return {
          kind: "capture.ack",
          memoryId: r.memoryId,
          ...(r.duplicateOf ? { duplicateOf: r.duplicateOf } : {}),
        };
      }
      case "search.run": {
        const filters = msg.filters
          ? {
              ...(msg.filters.tags ? { tags: msg.filters.tags } : {}),
              ...(msg.filters.createdAfter ? { createdAfter: msg.filters.createdAfter } : {}),
              ...(msg.filters.createdBefore ? { createdBefore: msg.filters.createdBefore } : {}),
              ...(msg.filters.personId ? { personId: msg.filters.personId } : {}),
            }
          : undefined;
        const hits = await runSearch(deps, {
          query: msg.query,
          k: msg.k,
          ...(filters ? { filters } : {}),
        });
        // Kick off answer generation in the background; stream chunks via conn.
        // Defer one microtask so the search.hits reply flushes first; otherwise
        // the empty-hits branch of streamAnswer could write answer.chunk over
        // the same socket BEFORE search.hits goes out.
        const requestId = newUlid();
        queueMicrotask(() => {
          void streamAnswer(deps, conn, requestId, msg.query, hits);
        });
        return {
          kind: "search.hits",
          hits: hits.map((h) => ({
            memoryId: h.memoryId,
            score: h.score,
            snippet: h.snippet,
            ...(h.ownerPeerId ? { ownerPeerId: h.ownerPeerId } : {}),
            tags: h.tags,
          })),
        };
      }
      case "memory.get": {
        const m = await getMemory(deps, msg.memoryId as Ulid);
        if (!m) {
          return { kind: "error", code: "not-found", message: msg.memoryId };
        }
        return {
          kind: "search.hits",
          hits: [
            {
              memoryId: m.id,
              score: 1,
              snippet: m.summary,
              tags: m.tags,
            },
          ],
        };
      }
      case "tts.play": {
        for await (const chunk of streamTts(deps, msg.text)) {
          conn.send({
            kind: "tts.chunk",
            requestId: msg.requestId,
            audioBase64: Buffer.from(chunk).toString("base64"),
          });
        }
        return { kind: "tts.done", requestId: msg.requestId };
      }
    }
  };
}

async function streamAnswer(
  deps: BridgeDeps,
  conn: Conn,
  requestId: string,
  query: string,
  hits: readonly SearchHitForAnswer[]
): Promise<void> {
  if (hits.length === 0) {
    conn.send({
      kind: "answer.chunk",
      requestId,
      text: "I don't have any memories matching that question yet.",
    });
    conn.send({ kind: "answer.done", requestId, citations: [] });
    return;
  }
  const context = hits
    .slice(0, 4)
    .map((h, i) => `[${i + 1}] ${h.snippet}`)
    .join("\n");
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "Answer the user's question grounded ONLY in the provided snippets. Use [1], [2] inline citations.",
    },
    { role: "user", content: `Snippets:\n${context}\n\nQuestion: ${query}` },
  ];
  try {
    const text = await complete(deps.pool, messages);
    conn.send({ kind: "answer.chunk", requestId, text });
    conn.send({
      kind: "answer.done",
      requestId,
      citations: hits.slice(0, 4).map((h) => ({
        memoryId: h.memoryId,
        ...(h.ownerPeerId ? { ownerPeerId: h.ownerPeerId } : {}),
      })),
    });
  } catch (err) {
    conn.send({
      kind: "error",
      requestId,
      code: "answer-failed",
      message: err instanceof Error ? err.message : "unknown",
    });
  }
}
