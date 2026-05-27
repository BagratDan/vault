import { ensureEmbedModel, embedText, type ModelPool } from "@vault/ai";
import { chunkText } from "@vault/ingest";
import type { Workspace } from "@vault/retrieval";
import type { Memory } from "@vault/domain";

export interface ChunkEmbedDeps {
  pool: ModelPool;
  workspace: Workspace;
  ownerPeerId: string;
}

export interface ChunkEmbedResult {
  chunks: number;
  embedded: number;
  errors: number;
}

/**
 * Chunk a memory's body, embed each chunk under EmbeddingGemma's token
 * limit, and ingest each into the search workspace keyed
 * `<memoryId>#<chunkIndex>`. Used by BOTH folder ingest and capture so a
 * large document is searchable (the whole-body embed overflowed the 1024-
 * token batch limit and silently failed). A per-chunk embed error is logged
 * + skipped; sibling chunks still index — the file is never lost.
 */
export async function chunkAndEmbed(
  deps: ChunkEmbedDeps,
  memory: Memory
): Promise<ChunkEmbedResult> {
  const chunks = chunkText(memory.body);
  if (chunks.length === 0) return { chunks: 0, embedded: 0, errors: 0 };
  const embedModelId = await ensureEmbedModel(deps.pool);
  let embedded = 0;
  let errors = 0;
  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci]!;
    try {
      const vector = await embedText(deps.pool, chunk);
      await deps.workspace.ingest({
        memoryId: `${memory.id}#${ci}`,
        body: chunk,
        tags: memory.tags,
        embedding: vector,
        embeddingModelId: embedModelId,
        metadata: {
          ownerPeerId: deps.ownerPeerId,
          createdAt: memory.createdAt,
        },
      });
      embedded++;
    } catch (err) {
      errors++;
      console.warn(
        `[vault] chunkAndEmbed: chunk ${ci} of ${memory.id} failed:`,
        err
      );
    }
  }
  return { chunks: chunks.length, embedded, errors };
}
