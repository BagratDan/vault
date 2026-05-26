import { ragReindex, ragIngest, ragCloseWorkspace } from "@qvac/sdk";
import type { Ulid } from "@vault/domain";

export async function reindexAll(
  workspace: string
): Promise<{ workspace: string; reindexed: number }> {
  const result = await ragReindex({ workspace });
  return result;
}

export interface MemoryForMigration {
  memoryId: Ulid;
  body: string;
  tags: readonly string[];
}

export interface MigrateInput {
  oldWorkspace: string;
  newWorkspace: string;
  /** Async iterator yielding every memory to copy. Allows streaming a large index. */
  memories: () => AsyncIterable<MemoryForMigration>;
}

export async function migrateWorkspace(input: MigrateInput): Promise<string> {
  for await (const m of input.memories()) {
    await ragIngest({
      workspace: input.newWorkspace,
      doc: {
        id: m.memoryId,
        text: m.body,
        metadata: { memoryId: m.memoryId, tags: m.tags.join(",") },
      },
    });
  }
  await ragCloseWorkspace({ workspace: input.oldWorkspace });
  return input.newWorkspace;
}
