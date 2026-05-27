import {
  ragSaveEmbeddings,
  ragCloseWorkspace,
  ragDeleteWorkspace,
} from "@qvac/sdk";

export function workspaceName(peerId: string): string {
  if (peerId.length < 6) {
    throw new Error("peerId too short");
  }
  return `vault-${peerId.slice(0, 6)}`;
}

export interface IngestInput {
  /** Workspace document id. For chunked memories this is
   *  `<memoryId>#<chunkIndex>`; the parent memoryId is recovered at search
   *  time by splitting on the last '#'. (ragSearch v0.11.0 does not return
   *  stored metadata, so the parent is encoded in the id, not metadata.) */
  memoryId: string;
  body: string;
  tags: readonly string[];
  /** Pre-computed embedding for `body`. Computed in the capture pipeline
   *  via @vault/ai's `embedText` so the workspace doesn't have to know
   *  about the model pool. */
  embedding: number[];
  /** SDK modelId of the embedding model that produced `embedding`. */
  embeddingModelId: string;
  /** Optional metadata bag persisted alongside the embedding. */
  metadata?: Record<string, string>;
}

export class Workspace {
  private readonly name: string;
  private closed = false;

  constructor(peerId: string) {
    this.name = workspaceName(peerId);
  }

  getName(): string {
    return this.name;
  }

  async ingest(input: IngestInput): Promise<void> {
    this.ensureOpen();
    await ragSaveEmbeddings({
      workspace: this.name,
      documents: [
        {
          id: input.memoryId,
          content: input.body,
          embedding: input.embedding,
          embeddingModelId: input.embeddingModelId,
          metadata: {
            memoryId: input.memoryId,
            tags: input.tags.join(","),
            ...(input.metadata ?? {}),
          },
        },
      ],
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await ragCloseWorkspace({ workspace: this.name });
  }

  async destroy(): Promise<void> {
    this.closed = true;
    await ragDeleteWorkspace({ workspace: this.name });
  }

  /** Drop all indexed documents (wipe-and-rebuild reindex). The SDK
   *  re-creates the workspace lazily on the next ingest(), so the instance
   *  stays usable — unlike destroy(), this does NOT close the instance. */
  async reset(): Promise<void> {
    this.ensureOpen();
    await ragDeleteWorkspace({ workspace: this.name });
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new Error(`workspace ${this.name} is closed`);
    }
  }
}
