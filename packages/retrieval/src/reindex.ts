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
 *  Throws if any memory fails to ingest. */
export async function migrateWorkspace(input: {
  oldWorkspace: string;
  newWorkspace: string;
  modelId: string;
  memories: () => AsyncIterable<MemoryForMigration>;
}): Promise<string> {
  let count = 0;
  let failed = 0;
  for await (const m of input.memories()) {
    count++;
    const res = await ragIngest({
      workspace: input.newWorkspace,
      modelId: input.modelId,
      documents: [m.body],
      chunk: true,
    });
    const ok = res.processed.some((p) => p.status === "fulfilled");
    if (!ok) failed++;
  }
  if (failed > 0) {
    throw new Error(`migrateWorkspace: ${failed} of ${count} memories failed to ingest`);
  }
  return input.newWorkspace;
}
