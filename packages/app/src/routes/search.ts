import { ensureEmbedModel, type ModelPool } from "@vault/ai";
import {
  search,
  type Workspace,
  type SearchFilters,
  type SearchHit,
} from "@vault/retrieval";

export interface SearchDeps {
  pool: ModelPool;
  workspace: Workspace;
}

export interface SearchRouteInput {
  query: string;
  k: number;
  filters?: SearchFilters;
}

export async function runSearch(
  deps: SearchDeps,
  input: SearchRouteInput
): Promise<SearchHit[]> {
  const modelId = await ensureEmbedModel(deps.pool);
  return search({
    modelId,
    workspace: deps.workspace.getName(),
    query: input.query,
    k: input.k,
    ...(input.filters ? { filters: input.filters } : {}),
  });
}
