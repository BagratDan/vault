import {
  clientMessageShape,
  type ClientMessage,
  type ServerMessage,
} from "./messages.js";
import type { VaultRuntime } from "./routes/vault.js";
import type { VaultFs } from "./vault-fs.js";
import type { ModelPool } from "@vault/ai";
import type { Workspace } from "@vault/retrieval";
import type { Repo, Indexes } from "@vault/sync";
import { captureText, captureAudio } from "./routes/capture.js";
import { runSearch } from "./routes/search.js";
import { getMemory } from "./routes/memory.js";
import { streamTts } from "./routes/tts.js";
import * as vaultRoutes from "./routes/vault.js";
import { complete, type ChatMessage } from "@vault/ai";
import { newUlid, type Ulid } from "@vault/domain";

/**
 * BridgeDeps holds the long-lived process state plus FACTORIES for
 * vault-specific singletons (Repo, Indexes). The factories throw if the
 * vault isn't active yet — every route handler that needs them does so
 * lazily, so commands like vault.create/vault.status work before any
 * Autobee store is open.
 */
export interface BridgeDeps {
  pool: ModelPool;
  workspace: Workspace;
  fs: VaultFs;
  ownerPeerId: string;
  identity: {
    peerId: string;
    publicKey: Uint8Array;
    privateKey: Uint8Array;
  };
  runtime: VaultRuntime;
  getRepo: () => Repo;
  getIndexes: () => Indexes;
}

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

    try {
      return await routeMessage(deps, conn, msg);
    } catch (err) {
      const code = msg.kind.replace(/\./g, "-") + "-failed";
      return {
        kind: "error",
        code,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  };
}

function requireVaultActive<T>(
  deps: BridgeDeps,
  fn: () => Promise<T>
): Promise<T> {
  if (!deps.runtime.state) {
    throw new Error("no-vault: Create or join a Vault first.");
  }
  return fn();
}

async function routeMessage(
  deps: BridgeDeps,
  conn: Conn,
  msg: ClientMessage
): Promise<ServerMessage> {
  switch (msg.kind) {
    // ── Vault setup + presence ────────────────────────────────────────
    case "vault.status": {
      const r = await vaultRoutes.vaultStatus({
        fs: deps.fs,
        identity: deps.identity,
        runtime: deps.runtime,
      });
      return {
        kind: "vault.status",
        state: r.state,
        ...(r.vaultId !== undefined ? { vaultId: r.vaultId } : {}),
        ...(r.vaultName !== undefined ? { vaultName: r.vaultName } : {}),
        ...(r.selfPeerId !== undefined ? { selfPeerId: r.selfPeerId } : {}),
      };
    }
    case "vault.create": {
      const r = await vaultRoutes.vaultCreate(
        { fs: deps.fs, identity: deps.identity, runtime: deps.runtime },
        { displayName: msg.displayName }
      );
      return { kind: "vault.created", vaultId: r.vaultId, peerId: r.peerId };
    }
    case "vault.invite-create": {
      const r = await vaultRoutes.vaultInviteCreate(
        { fs: deps.fs, identity: deps.identity, runtime: deps.runtime },
        {
          ...(msg.placeholderDisplayName
            ? { placeholderDisplayName: msg.placeholderDisplayName }
            : {}),
          ...(msg.expiresIn ? { expiresIn: msg.expiresIn } : {}),
        }
      );
      return { kind: "invite.token", token: r.token, expiresAt: r.expiresAt };
    }
    case "vault.invite-accept": {
      const r = await vaultRoutes.vaultInviteAccept(
        { fs: deps.fs, identity: deps.identity, runtime: deps.runtime },
        { token: msg.token, displayName: msg.displayName }
      );
      return { kind: "vault.joined", vaultId: r.vaultId, peerId: r.peerId };
    }
    case "peer.list": {
      const r = await vaultRoutes.peerList({
        fs: deps.fs,
        identity: deps.identity,
        runtime: deps.runtime,
      });
      return { kind: "peer.list", peers: r.peers };
    }

    // ── Content capture + retrieval (require an active vault) ─────────
    case "capture.text": {
      return requireVaultActive(deps, async () => {
        const r = await captureText(
          {
            pool: deps.pool,
            repo: deps.getRepo(),
            indexes: deps.getIndexes(),
            workspace: deps.workspace,
            fs: deps.fs,
            ownerPeerId: deps.ownerPeerId,
          },
          { text: msg.text, tags: msg.tags }
        );
        return {
          kind: "capture.ack",
          memoryId: r.memoryId,
          ...(r.duplicateOf ? { duplicateOf: r.duplicateOf } : {}),
        };
      });
    }
    case "capture.audio": {
      return requireVaultActive(deps, async () => {
        const audio = Uint8Array.from(Buffer.from(msg.audioBase64, "base64"));
        const r = await captureAudio(
          {
            pool: deps.pool,
            repo: deps.getRepo(),
            indexes: deps.getIndexes(),
            workspace: deps.workspace,
            fs: deps.fs,
            ownerPeerId: deps.ownerPeerId,
          },
          { audio, tags: msg.tags }
        );
        return {
          kind: "capture.ack",
          memoryId: r.memoryId,
          ...(r.duplicateOf ? { duplicateOf: r.duplicateOf } : {}),
        };
      });
    }
    case "search.run": {
      return requireVaultActive(deps, async () => {
        const filters = msg.filters
          ? {
              ...(msg.filters.tags ? { tags: msg.filters.tags } : {}),
              ...(msg.filters.createdAfter
                ? { createdAfter: msg.filters.createdAfter }
                : {}),
              ...(msg.filters.createdBefore
                ? { createdBefore: msg.filters.createdBefore }
                : {}),
              ...(msg.filters.personId
                ? { personId: msg.filters.personId }
                : {}),
            }
          : undefined;
        const hits = await runSearch(
          {
            pool: deps.pool,
            workspace: deps.workspace,
            swarm: deps.runtime.swarm,
            selfPeerId: deps.identity.peerId,
          },
          {
            query: msg.query,
            k: msg.k,
            ...(filters ? { filters } : {}),
          }
        );
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
      });
    }
    case "memory.get": {
      return requireVaultActive(deps, async () => {
        const m = await getMemory({ repo: deps.getRepo() }, msg.memoryId as Ulid);
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
      });
    }
    case "tts.play": {
      for await (const chunk of streamTts({ pool: deps.pool }, msg.text)) {
        conn.send({
          kind: "tts.chunk",
          requestId: msg.requestId,
          audioBase64: Buffer.from(chunk).toString("base64"),
        });
      }
      return { kind: "tts.done", requestId: msg.requestId };
    }
  }
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
