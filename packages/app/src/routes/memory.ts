import type { Repo } from "@vault/sync";
import type { Ulid, Memory } from "@vault/domain";

export interface MemoryDeps {
  repo: Repo;
}

export async function getMemory(deps: MemoryDeps, id: Ulid): Promise<Memory | null> {
  return deps.repo.getMemory(id);
}
