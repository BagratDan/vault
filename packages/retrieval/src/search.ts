import { ragSearch } from "@qvac/sdk";
import { matchesFilters, type SearchFilters, type RawHit } from "./filter.js";

export interface SearchInput {
  workspace: string;
  /** Embedding modelId used for the query — must match the one used at ingest. */
  modelId: string;
  query: string;
  k: number;
  filters?: SearchFilters;
  /** Resolves side-index metadata for parent memory ids. Injected by the app
   *  layer so retrieval need not import sync (preserves the layer rule). */
  metaLookup?: (ids: readonly string[]) => Promise<Map<string, Record<string, string>>>;
}

export interface SearchHit {
  memoryId: string;
  score: number;
  snippet: string;
  ownerPeerId?: string;
  tags: string[];
}

/** Recover the parent memoryId from a chunk document id `<memoryId>#<ci>`.
 *  Legacy un-chunked ids (no '#') are their own parent. */
function parentMemoryId(docId: string): string {
  const i = docId.lastIndexOf("#");
  return i === -1 ? docId : docId.slice(0, i);
}

export async function search(input: SearchInput): Promise<SearchHit[]> {
  const raw = await ragSearch({
    modelId: input.modelId,
    workspace: input.workspace,
    query: input.query,
    // Over-fetch: several top chunks may share one parent, so widen before
    // dedup so distinct files aren't lost. Sliced back to k after dedup.
    topK: input.k * 4,
  });

  // The SDK's SearchResult only carries { id, content, score } — metadata
  // we stored at ingest (ownerPeerId, tags, createdAt, ...) is NOT returned
  // by ragSearch in v0.11.0. We resolve it from the app-injected side-index
  // lookup (metaLookup) so the filters below act on real data while keeping
  // retrieval free of a @vault/sync dependency.
  const parentIds = [...new Set(raw.map((r) => parentMemoryId(r.id)))];
  const meta = input.metaLookup ? await input.metaLookup(parentIds) : new Map<string, Record<string, string>>();

  const filtered: SearchHit[] = [];
  for (const r of raw) {
    const parent = parentMemoryId(r.id);
    const md = meta.get(parent) ?? {};
    const hit: RawHit = {
      memoryId: r.id,
      score: r.score,
      snippet: r.content,
      metadata: md,
    };
    if (!matchesFilters(hit, input.filters)) continue;
    const tags = (md["tags"] ?? "").split(",").filter(Boolean);
    filtered.push({ memoryId: r.id, score: r.score, snippet: r.content, tags });
  }
  // Collapse chunk hits to one result per parent memory, keeping the
  // highest-scoring chunk (its content becomes the snippet). Downstream
  // flows (folderId resolution, consent, citations) key off the parent id.
  const bestByParent = new Map<string, SearchHit>();
  for (const h of filtered) {
    const parent = parentMemoryId(h.memoryId);
    const prev = bestByParent.get(parent);
    if (!prev || h.score > prev.score) {
      bestByParent.set(parent, { ...h, memoryId: parent });
    }
  }
  const deduped = [...bestByParent.values()].sort((a, b) => b.score - a.score);
  return deduped.slice(0, input.k);
}
