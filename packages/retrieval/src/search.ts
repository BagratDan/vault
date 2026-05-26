import { ragSearch } from "@qvac/sdk";
import { matchesFilters, type SearchFilters, type RawHit } from "./filter.js";

export interface SearchInput {
  workspace: string;
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
    workspace: input.workspace,
    query: input.query,
    limit: input.k,
  });

  const filtered: SearchHit[] = [];
  for (const r of raw.results) {
    const hit: RawHit = {
      memoryId: r.metadata["memoryId"] ?? r.id,
      score: r.score,
      snippet: r.snippet,
      metadata: r.metadata,
    };
    if (!matchesFilters(hit, input.filters)) continue;
    filtered.push({
      memoryId: hit.memoryId,
      score: hit.score,
      snippet: hit.snippet,
      ...(r.metadata["ownerPeerId"] ? { ownerPeerId: r.metadata["ownerPeerId"] } : {}),
      tags: (r.metadata["tags"] ?? "").split(",").filter(Boolean),
    });
  }
  filtered.sort((a, b) => b.score - a.score);
  return filtered;
}
