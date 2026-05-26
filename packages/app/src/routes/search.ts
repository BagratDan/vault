import { newUlid } from "@vault/domain";
import { blurPreview, ensureEmbedModel, type ModelPool } from "@vault/ai";
import {
  search,
  type Workspace,
  type SearchFilters,
  type SearchHit,
} from "@vault/retrieval";
import type { SwarmTransport } from "@vault/sync";

export interface SearchDeps {
  pool: ModelPool;
  workspace: Workspace;
  /** When set, federated fan-out queries peers in addition to the local index. */
  swarm?: SwarmTransport | null;
  /** Self peerId, stamped on local hits so the requester can attribute them. */
  selfPeerId?: string;
}

export interface SearchRouteInput {
  query: string;
  k: number;
  filters?: SearchFilters;
}

interface SearchProbe {
  v: 1;
  requestId: string;
  query: string;
  k: number;
}

interface SearchProbeReply {
  v: 1;
  requestId: string;
  hits: SearchHit[];
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
): Promise<SearchHit[]> {
  const localHits = await searchLocal(deps, input);
  const peers = deps.swarm?.listConnectedPeers() ?? [];
  if (peers.length === 0) return applyFilters(localHits, input.filters);

  const remoteSettled = await Promise.allSettled(
    peers.map((peerId) =>
      Promise.race([
        deps.swarm!.request(peerId, "search.probe", {
          v: 1,
          requestId: newUlid(),
          query: input.query,
          k: input.k,
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
  const remoteHits: SearchHit[] = [];
  for (const r of remoteSettled) {
    if (r.status !== "fulfilled") continue;
    const reply = r.value as SearchProbeReply;
    if (Array.isArray(reply?.hits)) remoteHits.push(...reply.hits);
  }
  const byId = new Map<string, SearchHit>();
  for (const h of [...localHits, ...remoteHits]) {
    const prev = byId.get(h.memoryId);
    if (!prev || h.score > prev.score) byId.set(h.memoryId, h);
  }
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
 */
export async function handleSearchProbe(
  deps: { pool: ModelPool; workspace: Workspace; selfPeerId: string },
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
  const blurred = localHits.map((h) => ({ ...h, snippet: blurPreview(h.snippet) }));
  return { v: 1, requestId: probe.requestId, hits: blurred };
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
  });
  // Stamp ownerPeerId so cross-peer dedupe + UI attribution work.
  return hits.map((h) =>
    deps.selfPeerId && !h.ownerPeerId
      ? { ...h, ownerPeerId: deps.selfPeerId }
      : h
  );
}

function applyFilters(
  hits: SearchHit[],
  filters?: SearchFilters
): SearchHit[] {
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
