import type { ModelPool } from "@vault/ai";
import type { Workspace } from "@vault/retrieval";
import type { Repo, FolderLocal } from "@vault/sync";
import { chunkAndEmbed } from "../chunk-embed.js";

export interface ReindexDeps {
  pool: ModelPool;
  workspace: Workspace;
  ownerPeerId: string;
  getRepo: () => Repo;
  getFolderLocal: () => FolderLocal | null;
}

export interface ReindexResult {
  memories: number;
  embedded: number;
  errors: number;
}

/**
 * Wipe-and-rebuild the search index: drop the whole workspace, then
 * re-chunk + re-embed every memory (public autobee memories + the owner's
 * private-folder memories). Dropping first guarantees no orphan chunks.
 */
export async function reindexAllMemories(deps: ReindexDeps): Promise<ReindexResult> {
  const all = await deps.getRepo().listMemories();
  const fl = deps.getFolderLocal();
  const privates = fl ? await fl.listAllPrivateMemories() : [];
  const everything = [...all, ...privates];

  // Drop the entire workspace so prior/orphan chunks are cleared, then
  // re-embed from scratch.
  await deps.workspace.reset();

  let embedded = 0;
  let errors = 0;
  for (const m of everything) {
    const r = await chunkAndEmbed(
      { pool: deps.pool, workspace: deps.workspace, ownerPeerId: deps.ownerPeerId },
      m
    );
    embedded += r.embedded;
    errors += r.errors;
  }
  return { memories: everything.length, embedded, errors };
}
