import { ragSearch } from "@qvac/sdk";
import { matchesFilters, type SearchFilters, type RawHit } from "./filter.js";

export interface SearchInput {
  workspace: string;
  /** Embedding modelId used for the query — must match the one used at ingest. */
  modelId: string;
  query: string;
  k: number;
  filters?: SearchFilters;
}

export interface SearchHit {
  memoryId: string;
  score: number;
  snippet: string;
  ownerPeerId?: string;
  tags: string[];
}

export async function search(input: SearchInput): Promise<SearchHit[]> {
  const raw = await ragSearch({
    modelId: input.modelId,
    workspace: input.workspace,
    query: input.query,
    topK: input.k,
  });

  // The SDK's SearchResult only carries { id, content, score }. Metadata
  // we stored at ingest (ownerPeerId, tags, createdAt, ...) is NOT
  // returned by ragSearch in v0.11.0. Filters that depend on it are
  // applied client-side and may not have data to act on; for now, only
  // the id-based filters work post-search. This is a known limitation
  // and documented in the README's known-limitations section.
  const filtered: SearchHit[] = [];
  for (const r of raw) {
    const hit: RawHit = {
      memoryId: r.id,
      score: r.score,
      snippet: r.content,
      metadata: {},
    };
    if (!matchesFilters(hit, input.filters)) continue;
    filtered.push({
      memoryId: r.id,
      score: r.score,
      snippet: r.content,
      tags: [],
    });
  }
  filtered.sort((a, b) => b.score - a.score);
  return filtered;
}
