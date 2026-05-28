import { newUlid } from "@vault/domain";
import { blurPreview, ensureEmbedModel, type ModelPool } from "@vault/ai";
import {
  search,
  type Workspace,
  type SearchFilters,
  type SearchHit,
} from "@vault/retrieval";
import type { SwarmTransport, Repo, FolderLocal } from "@vault/sync";

/** A SearchHit carrying its resolved folder, so the UI can scope/attribute it. */
type FolderHit = SearchHit & { folderId?: string };

export interface SearchDeps {
  pool: ModelPool;
  workspace: Workspace;
  /** When set, federated fan-out queries peers in addition to the local index. */
  swarm?: SwarmTransport | null;
  /** Self peerId, stamped on local hits so the requester can attribute them. */
  selfPeerId?: string;
  /**
   * Autobee repo, used to resolve a memoryId → its folderId. Optional: when
   * absent, folder resolution is skipped (legacy no-folder behavior).
   */
  repo?: Repo;
  /**
   * Owner-local store, used to resolve PRIVATE memories' folderId + a
   * folder's visibility. Optional / nullable for the same legacy fallback.
   */
  folderLocal?: FolderLocal | null;
  /**
   * Resolves side-index metadata for parent memory ids, injected so the
   * pure @vault/retrieval search() can apply metadata-dependent filters
   * without importing @vault/sync (preserves the layer rule). Optional:
   * when absent, search() runs with empty metadata (legacy behavior).
   */
  metaLookup?: (
    ids: readonly string[]
  ) => Promise<Map<string, Record<string, string>>>;
}

export interface SearchRouteInput {
  query: string;
  k: number;
  filters?: SearchFilters;
  /** When set, restrict hits to memories whose folderId is in this set. */
  folderIds?: string[];
}

interface SearchProbe {
  v: 1;
  requestId: string;
  query: string;
  k: number;
  /** When set, the requester restricts results to these folders. */
  folderIds?: string[];
}

interface SearchProbeReply {
  v: 1;
  requestId: string;
  hits: FolderHit[];
}

/**
 * Deps for the peer-side probe handler. Unlike SearchDeps these are REQUIRED:
 * the probe handler MUST resolve folder visibility to enforce the privacy gate.
 */
export interface SearchProbeDeps {
  pool: ModelPool;
  workspace: Workspace;
  selfPeerId: string;
  repo: Repo;
  folderLocal: FolderLocal;
}

const PROBE_TIMEOUT_MS = 3_000;

/**
 * Fan-out search across all currently-connected peers (including self).
 * Each peer runs ragSearch against its own @qvac/rag workspace, returns
 * top-K hits. We merge, dedupe by memoryId (own + remote may overlap
 * once Autobee replicates a memory), rerank by score, take top-K.
 */
export async function runSearch(
  deps: SearchDeps,
  input: SearchRouteInput
): Promise<FolderHit[]> {
  const rawLocal = await searchLocal(deps, input);
  // Resolve folderId on each LOCAL hit so the requester's own folder-scoped
  // search works and so hits carry folderId for the UI. Note: we do NOT drop
  // private folders here — the owner sees their own private memories. Only the
  // probe handler (which serves REMOTE peers) drops private.
  const allow = input.folderIds ? new Set(input.folderIds) : null;
  const localHits: FolderHit[] = [];
  for (const h of rawLocal) {
    const folderId = await resolveFolderId(deps, h.memoryId);
    if (allow && !(folderId && allow.has(folderId))) continue;
    localHits.push(folderId ? { ...h, folderId } : { ...h });
  }

  const peers = deps.swarm?.listConnectedPeers() ?? [];
  if (peers.length === 0) {
    // Stage 2: re-apply filters across the merged local+remote set. Stage 1
    // (matchesFilters inside search()) already filtered LOCAL hits, but REMOTE
    // hits from probe replies bypass Stage 1 — Stage 2 is their only filter
    // gate. Do NOT remove this even though it looks redundant on the no-peer path.
    return applyFilters(localHits, input.filters);
  }

  const remoteSettled = await Promise.allSettled(
    peers.map((peerId) =>
      Promise.race([
        deps.swarm!.request(peerId, "search.probe", {
          v: 1,
          requestId: newUlid(),
          query: input.query,
          k: input.k,
          ...(input.folderIds ? { folderIds: input.folderIds } : {}),
        } satisfies SearchProbe),
        new Promise<never>((_, rej) =>
          setTimeout(
            () => rej(new Error("rpc.timeout")),
            PROBE_TIMEOUT_MS
          )
        ),
      ])
    )
  );
  const remoteHits: FolderHit[] = [];
  for (const r of remoteSettled) {
    if (r.status !== "fulfilled") continue;
    const reply = r.value as SearchProbeReply;
    if (Array.isArray(reply?.hits)) remoteHits.push(...reply.hits);
  }
  const byId = new Map<string, FolderHit>();
  for (const h of [...localHits, ...remoteHits]) {
    const prev = byId.get(h.memoryId);
    if (!prev || h.score > prev.score) byId.set(h.memoryId, h);
  }
  // Stage 2: re-apply filters across the merged local+remote set. Stage 1
  // (matchesFilters inside search()) already filtered LOCAL hits, but REMOTE
  // hits from probe replies bypass Stage 1 — Stage 2 is their only filter
  // gate. Do NOT remove this even though it looks redundant on the no-peer path.
  return applyFilters(
    [...byId.values()].sort((a, b) => b.score - a.score).slice(0, input.k),
    input.filters
  );
}

/**
 * The peer-side handler for incoming search.probe RPCs. Runs ragSearch
 * against the LOCAL workspace (no further fan-out — that would loop).
 * Stamps ownerPeerId so the requester knows which peer hits came from.
 *
 * Plan 3: snippets are blurred at the RPC boundary. Real content only
 * crosses the wire after a successful consent.request → consent.response.
 *
 * Plan 4 (Task 17) — PROBE-TIME PRIVACY GATE. A private memory's embedding
 * lives in the SAME unified workspace as public ones, so search() WILL return
 * it. The storage gate (Task 13) keeps private memories out of Autobee, but
 * THIS peer's own workspace still contains them — so the probe handler, which
 * serves REMOTE requesters, MUST drop any hit whose folder is private.
 */
export async function handleSearchProbe(
  deps: SearchProbeDeps,
  probe: SearchProbe
): Promise<SearchProbeReply> {
  const localHits = await searchLocal(
    {
      pool: deps.pool,
      workspace: deps.workspace,
      selfPeerId: deps.selfPeerId,
    },
    { query: probe.query, k: probe.k }
  );
  // handleSearchProbe only ever serves the LOCAL peer's own memories (it
  // searches the local workspace), so folderLocal.listFolders is authoritative
  // for visibility.
  const folders = await deps.folderLocal.listFolders();
  const visById = new Map(folders.map((f) => [f.id, f.visibility] as const));
  const allow = probe.folderIds ? new Set(probe.folderIds) : null;
  const out: FolderHit[] = [];
  for (const h of localHits) {
    const folderId = await resolveFolderId(deps, h.memoryId);
    if (!folderId) continue; // no folder → drop (legacy/unknown)
    // Positive allowlist: only known-PUBLIC folders pass. Unknown or private
    // folders are dropped. This makes the privacy default structural — it does
    // not depend on listFolders() happening to return private folders.
    if (visById.get(folderId) !== "public") continue; // PRIVACY GATE
    if (allow && !allow.has(folderId)) continue; // scope filter
    out.push({ ...h, folderId, snippet: blurPreview(h.snippet) });
  }
  return { v: 1, requestId: probe.requestId, hits: out };
}

/**
 * Resolve a memoryId → its folderId, or null if unknown. Public memories live
 * in Autobee (repo.getMemory); private memories live ONLY in the owner-local
 * store (folderLocal.getPrivateMemory). When neither dep is available, returns
 * null (legacy no-folder behavior).
 */
async function resolveFolderId(
  deps: { repo?: Repo; folderLocal?: FolderLocal | null },
  memoryId: string
): Promise<string | null> {
  if (deps.repo) {
    const pub = await deps.repo.getMemory(memoryId as never);
    if (pub) return pub.folderId ?? null;
  }
  if (deps.folderLocal) {
    const prv = await deps.folderLocal.getPrivateMemory(memoryId);
    if (prv) return prv.folderId ?? null;
  }
  return null;
}

async function searchLocal(
  deps: SearchDeps,
  input: { query: string; k: number; filters?: SearchFilters }
): Promise<SearchHit[]> {
  const modelId = await ensureEmbedModel(deps.pool);
  const hits = await search({
    modelId,
    workspace: deps.workspace.getName(),
    query: input.query,
    k: input.k,
    ...(input.filters ? { filters: input.filters } : {}),
    ...(deps.metaLookup ? { metaLookup: deps.metaLookup } : {}),
  });
  // Stamp ownerPeerId so cross-peer dedupe + UI attribution work.
  return hits.map((h) =>
    deps.selfPeerId && !h.ownerPeerId
      ? { ...h, ownerPeerId: deps.selfPeerId }
      : h
  );
}

function applyFilters<T extends SearchHit>(
  hits: T[],
  filters?: SearchFilters
): T[] {
  if (!filters) return hits;
  // Filter implementation lives in @vault/retrieval/filter.ts; for the
  // fan-out path it runs at the requester after merging. The plain
  // search() above already runs filters on the local-only path; here we
  // apply the same filter set in-memory.
  return hits.filter((h) => {
    if (filters.tags && filters.tags.length > 0) {
      const ok = filters.tags.every((t) => h.tags.includes(t));
      if (!ok) return false;
    }
    if (filters.ownerPeerId && h.ownerPeerId !== filters.ownerPeerId) {
      return false;
    }
    return true;
  });
}
