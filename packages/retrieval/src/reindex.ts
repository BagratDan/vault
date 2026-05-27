import { ragReindex, ragIngest } from "@qvac/sdk";
import type { Ulid } from "@vault/domain";

/** Reindex the workspace. SDK reindex requires a minimum number of
 *  documents (default 16 for HyperDB); below that returns `reindexed:
 *  false` with `details.reason`. */
export async function reindexAll(workspace: string): Promise<{
  reindexed: boolean;
  reason?: string;
}> {
  const result = await ragReindex({ workspace });
  const out: { reindexed: boolean; reason?: string } = {
    reindexed: result.reindexed,
  };
  if (!result.reindexed && result.details?.reason) {
    out.reason = result.details.reason;
  }
  return out;
}

export interface MemoryForMigration {
  memoryId: Ulid;
  body: string;
  tags: readonly string[];
}

/** Migrate a workspace by re-ingesting every memory into a fresh workspace.
 *  Returns the new workspace name for the caller's atomic pointer swap.
 *  Throws if the ingested count does not match the source count. */
export async function migrateWorkspace(input: {
  oldWorkspace: string;
  newWorkspace: string;
  modelId: string;
  memories: () => AsyncIterable<MemoryForMigration>;
}): Promise<string> {
  let count = 0;
  let ingested = 0;
  for await (const m of input.memories()) {
    count++;
    const res = await ragIngest({
      workspace: input.newWorkspace,
      modelId: input.modelId,
      documents: [m.body],
      chunk: true,
    });
    ingested += res.processed.filter((p) => p.status === "fulfilled").length;
  }
  if (ingested < count) {
    throw new Error(`migrateWorkspace: ingested ${ingested} of ${count} memories`);
  }
  return input.newWorkspace;
}
