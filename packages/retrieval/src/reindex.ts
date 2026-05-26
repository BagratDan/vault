import { ragReindex } from "@qvac/sdk";
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

/** Workspace migration (atomic-pointer-swap pattern) is a Plan-3 feature.
 *  In v1 the migration path is: stop the sidecar, delete the workspace
 *  on disk, restart — the capture pipeline re-ingests on next launch. */
export async function migrateWorkspace(_input: {
  oldWorkspace: string;
  newWorkspace: string;
  memories: () => AsyncIterable<MemoryForMigration>;
}): Promise<string> {
  throw new Error(
    "migrateWorkspace: not implemented in Plan 1. See README known-limitations."
  );
}
