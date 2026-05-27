import {
  clientMessageShape,
  type ClientMessage,
  type ServerMessage,
} from "./messages.js";
import type { VaultRuntime } from "./routes/vault.js";
import type { VaultFs } from "./vault-fs.js";
import type { ModelPool } from "@vault/ai";
import type { Workspace } from "@vault/retrieval";
import {
  signCanonical,
  type AuditLog,
  type Repo,
  type Indexes,
  type Scope,
  type FolderLocal,
} from "@vault/sync";
import type { ConsentEvent } from "@vault/domain";
import { captureText, captureAudio } from "./routes/capture.js";
import { runSearch } from "./routes/search.js";
import { getMemory } from "./routes/memory.js";
import { reindexAllMemories } from "./routes/reindex.js";
import { streamTts } from "./routes/tts.js";
import * as vaultRoutes from "./routes/vault.js";
import {
  consentRequest as consentRequestRoute,
  consentRespond as consentRespondRoute,
  consentListPending as consentListPendingRoute,
  type ConsentDeps,
} from "./routes/consent.js";
import type { ConsentState } from "./consent-state.js";
import * as folderRoutes from "./routes/folder.js";
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
  /**
   * Lazy accessors for consent + audit. Both return null until activateVault()
   * has wired them up. Routes that require them call requireConsent() to
   * narrow the types.
   */
  getConsentState: () => ConsentState | null;
  getAudit: () => AuditLog | null;
  selfDisplayName: () => string;
  getFolderLocal: () => FolderLocal | null;
  broadcast: (msg: unknown) => void;
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

function requireConsent(deps: BridgeDeps): {
  consentState: ConsentState;
  audit: AuditLog;
} {
  const consentState = deps.getConsentState();
  const audit = deps.getAudit();
  if (!consentState || !audit) {
    throw new Error("no-vault: Consent + audit subsystems are not active.");
  }
  return { consentState, audit };
}

function buildConsentDeps(deps: BridgeDeps): ConsentDeps {
  const { consentState, audit } = requireConsent(deps);
  return {
    swarm: deps.runtime.swarm,
    consentState,
    audit,
    getRepo: deps.getRepo,
    selfPeerId: deps.identity.peerId,
    selfDisplayName: deps.selfDisplayName(),
  };
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
            // Stamp the autobee writer key (same as folders/search/roster),
            // not identity.peerId, so ownership attribution is consistent.
            ownerPeerId: deps.runtime.store?.localPeerId ?? deps.ownerPeerId,
            capturesFolderId:
              deps.runtime.state?.capturesFolderId ??
              "01J0CAPTVRES000000000000AA",
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
            // Stamp the autobee writer key (same as folders/search/roster),
            // not identity.peerId, so ownership attribution is consistent.
            ownerPeerId: deps.runtime.store?.localPeerId ?? deps.ownerPeerId,
            capturesFolderId:
              deps.runtime.state?.capturesFolderId ??
              "01J0CAPTVRES000000000000AA",
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
        // selfPeerId stamped on hits MUST match the peerId used in the
        // roster + vault.status reply (= the autobee writer key), so the
        // web UI can correctly compare h.ownerPeerId against selfPeerId
        // to suppress "Request access" on the user's own memories.
        const stampedPeerId =
          deps.runtime.state?.selfPeerId ?? deps.identity.peerId;
        const hits = await runSearch(
          {
            pool: deps.pool,
            workspace: deps.workspace,
            swarm: deps.runtime.swarm,
            selfPeerId: stampedPeerId,
            repo: deps.getRepo(),
            folderLocal: deps.getFolderLocal(),
          },
          {
            query: msg.query,
            k: msg.k,
            ...(filters ? { filters } : {}),
            ...(msg.folderIds ? { folderIds: msg.folderIds } : {}),
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
            ...(h.folderId ? { folderId: h.folderId } : {}),
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
    case "memory.list": {
      return requireVaultActive(deps, async () => {
        const all = await deps.getRepo().listMemories();
        // Sort newest first, cap at limit (default 50).
        const limit = msg.limit ?? 50;
        const sorted = [...all].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt)
        );
        const memories = sorted.slice(0, limit).map((m) => ({
          memoryId: m.id,
          summary: m.summary,
          body: m.body,
          tags: m.tags,
          createdAt: m.createdAt,
          ownerPeerId: m.ownerPeerId,
          confidence: m.confidence,
          folderId: m.folderId,
        }));
        return { kind: "memory.list", memories };
      });
    }
    case "memory.reindex": {
      return requireVaultActive(deps, async () => {
        const r = await reindexAllMemories({
          pool: deps.pool,
          workspace: deps.workspace,
          // autobee writer key for attribution, matching folder routes
          ownerPeerId: deps.runtime.store?.localPeerId ?? deps.identity.peerId,
          getRepo: deps.getRepo,
          getFolderLocal: deps.getFolderLocal,
        });
        return { kind: "memory.reindex", memories: r.memories, embedded: r.embedded, errors: r.errors };
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

    // ── Consent flow ─────────────────────────────────────────────────
    case "consent.request": {
      return requireVaultActive(deps, async () => {
        const cdeps = buildConsentDeps(deps);
        const r = await consentRequestRoute(cdeps, {
          memoryId: msg.memoryId,
          ownerPeerId: msg.ownerPeerId,
          scope: msg.scope as Scope,
        });
        if (r.status === "expired") {
          return {
            kind: "consent.expired",
            consentRequestId: r.consentRequestId,
            ...(r.reason ? { reason: r.reason } : {}),
          };
        }
        return { kind: "consent.pending", consentRequestId: r.consentRequestId };
      });
    }
    case "consent.respond": {
      return requireVaultActive(deps, async () => {
        const cdeps = buildConsentDeps(deps);
        await consentRespondRoute(cdeps, {
          consentRequestId: msg.consentRequestId,
          decision: msg.decision,
        });
        return {
          kind: "consent.pending",
          consentRequestId: msg.consentRequestId,
        };
      });
    }
    case "consent.list-pending": {
      return requireVaultActive(deps, async () => {
        const cdeps = buildConsentDeps(deps);
        const entries = consentListPendingRoute(cdeps);
        for (const e of entries) {
          conn.send({
            kind: "consent.incoming",
            consentRequestId: e.consentRequestId,
            requesterPeerId: e.requesterPeerId,
            requesterDisplayName: e.requesterDisplayName,
            memoryId: e.memoryId,
            memoryTitle: e.memoryId,
            scope: e.scope,
            expiresAt: e.expiresAt,
          });
        }
        return { kind: "consent.pending", consentRequestId: "list" };
      });
    }
    case "audit.query": {
      return requireVaultActive(deps, async () => {
        const { audit } = requireConsent(deps);
        const opts: {
          peerId?: string;
          since?: string;
          limit?: number;
        } = {};
        if (msg.peerId !== undefined) opts.peerId = msg.peerId;
        if (msg.since !== undefined) opts.since = msg.since;
        if (msg.limit !== undefined) opts.limit = msg.limit;
        const events: ConsentEvent[] = [];
        for await (const ev of audit.list(opts)) events.push(ev);
        return { kind: "audit.events", events };
      });
    }
    case "admin.member-list": {
      return requireVaultActive(deps, async () => {
        if (deps.runtime.state?.role !== "admin") {
          throw new Error("forbidden: admin role required");
        }
        const r = await vaultRoutes.peerList({
          fs: deps.fs,
          identity: deps.identity,
          runtime: deps.runtime,
        });
        return {
          kind: "admin.member-list",
          members: r.peers.map((p) => ({
            peerId: p.peerId,
            displayName: p.displayName,
            role: p.role,
          })),
        };
      });
    }
    case "admin.revoke-member": {
      return requireVaultActive(deps, async () => {
        if (deps.runtime.state?.role !== "admin") {
          throw new Error("forbidden: admin role required");
        }
        if (!deps.runtime.store) {
          throw new Error("vault not active");
        }
        const now = new Date().toISOString();
        const unsigned = {
          id: newUlid(),
          createdAt: now,
          updatedAt: now,
          ownerPeerId: deps.identity.peerId,
          provenance: { kind: "user" as const },
          vaultId: deps.runtime.state.vaultId,
          targetPeerId: msg.targetPeerId,
          issuedBy: deps.runtime.state.selfPeerId,
          effectiveAt: now,
          ...(msg.reason ? { reason: msg.reason } : {}),
        };
        const sig = signCanonical(unsigned, deps.runtime.store.secretKey);
        await deps.runtime.store.append({
          kind: "revocation",
          key: `revocation/${unsigned.id}`,
          value: { ...unsigned, sig },
        });
        await deps.runtime.store.flush();
        return { kind: "admin.revoke-ack", targetPeerId: msg.targetPeerId };
      });
    }
    case "memory.update-scopes": {
      return requireVaultActive(deps, async () => {
        const repo = deps.getRepo();
        const memory = await repo.getMemory(msg.memoryId as Ulid);
        if (!memory) {
          return {
            kind: "error",
            code: "not-found",
            message: msg.memoryId,
          };
        }
        const updated = {
          ...memory,
          requestableScopes: msg.requestableScopes,
          updatedAt: new Date().toISOString(),
        };
        await repo.putMemory(updated);
        return { kind: "capture.ack", memoryId: memory.id };
      });
    }

    // ── Folders ──────────────────────────────────────────────────────
    case "folder.add": {
      return requireVaultActive(deps, async () => {
        const fl = deps.getFolderLocal();
        if (!fl || !deps.runtime.store) {
          return { kind: "error", code: "no-vault", message: "vault not active" };
        }
        const r = await folderRoutes.folderAdd(
          {
            fs: deps.fs,
            folderLocal: fl,
            getRepo: deps.getRepo,
            pool: deps.pool,
            // Folder ownerPeerId MUST be the autobee writer key (store.localPeerId),
            // not identity.peerId — apply()'s folder gate requires
            // ownerPeerId === the signing writer, and the folder is signed with
            // store.secretKey. Mismatch → apply() silently drops the write.
            ownerPeerId: deps.runtime.store.localPeerId,
            storeSecretKey: deps.runtime.store.secretKey,
            broadcast: deps.broadcast,
            workspace: deps.workspace,
            flushStore: async () => { if (deps.runtime.store) await deps.runtime.store.flush(); },
          },
          { path: msg.path, displayName: msg.displayName, visibility: msg.visibility }
        );
        return { kind: "folder.added", folderId: r.folderId, displayName: r.displayName };
      });
    }
    case "folder.list": {
      return requireVaultActive(deps, async () => {
        const fl = deps.getFolderLocal();
        if (!fl) return { kind: "error", code: "no-vault", message: "vault not active" };
        const r = await folderRoutes.folderList({
          fs: deps.fs,
          folderLocal: fl,
          getRepo: deps.getRepo,
          pool: deps.pool,
          ownerPeerId: deps.runtime.store?.localPeerId ?? deps.identity.peerId,
          storeSecretKey: deps.runtime.store?.secretKey ?? new Uint8Array(64),
          broadcast: deps.broadcast,
          workspace: deps.workspace,
          flushStore: async () => { if (deps.runtime.store) await deps.runtime.store.flush(); },
        });
        return { kind: "folder.list", folders: r.folders };
      });
    }
    case "folder.update": {
      return requireVaultActive(deps, async () => {
        const fl = deps.getFolderLocal();
        if (!fl || !deps.runtime.store) {
          return { kind: "error", code: "no-vault", message: "vault not active" };
        }
        const r = await folderRoutes.folderUpdate(
          {
            fs: deps.fs, folderLocal: fl, getRepo: deps.getRepo, pool: deps.pool,
            ownerPeerId: deps.runtime.store.localPeerId, storeSecretKey: deps.runtime.store.secretKey,
            broadcast: deps.broadcast,
            workspace: deps.workspace,
            flushStore: async () => { if (deps.runtime.store) await deps.runtime.store.flush(); },
          },
          {
            folderId: msg.folderId,
            ...(msg.visibility ? { visibility: msg.visibility } : {}),
            ...(msg.displayName ? { displayName: msg.displayName } : {}),
          }
        );
        return { kind: "folder.updated", folderId: r.folderId };
      });
    }
    case "folder.delete": {
      return requireVaultActive(deps, async () => {
        const fl = deps.getFolderLocal();
        if (!fl || !deps.runtime.store) {
          return { kind: "error", code: "no-vault", message: "vault not active" };
        }
        const r = await folderRoutes.folderDelete(
          {
            fs: deps.fs, folderLocal: fl, getRepo: deps.getRepo, pool: deps.pool,
            ownerPeerId: deps.runtime.store.localPeerId, storeSecretKey: deps.runtime.store.secretKey,
            broadcast: deps.broadcast,
            workspace: deps.workspace,
            flushStore: async () => { if (deps.runtime.store) await deps.runtime.store.flush(); },
          },
          { folderId: msg.folderId }
        );
        return { kind: "folder.deleted", folderId: r.folderId };
      });
    }
    case "folder.rescan": {
      return requireVaultActive(deps, async () => {
        const fl = deps.getFolderLocal();
        if (!fl || !deps.runtime.store) {
          return { kind: "error", code: "no-vault", message: "vault not active" };
        }
        await folderRoutes.folderRescan(
          {
            fs: deps.fs, folderLocal: fl, getRepo: deps.getRepo, pool: deps.pool,
            ownerPeerId: deps.runtime.store.localPeerId, storeSecretKey: deps.runtime.store.secretKey,
            broadcast: deps.broadcast,
            workspace: deps.workspace,
            flushStore: async () => { if (deps.runtime.store) await deps.runtime.store.flush(); },
          },
          { folderId: msg.folderId }
        );
        return { kind: "folder.ingest-progress", folderId: msg.folderId, current: 0, total: 0, phase: "scanning" };
      });
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
