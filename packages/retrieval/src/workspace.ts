import {
  ragIngest,
  ragCloseWorkspace,
  ragDeleteWorkspace,
} from "@qvac/sdk";
import type { Ulid } from "@vault/domain";

export function workspaceName(peerId: string): string {
  if (peerId.length < 6) {
    throw new Error("peerId too short");
  }
  return `vault-${peerId.slice(0, 6)}`;
}

export interface IngestInput {
  memoryId: Ulid;
  body: string;
  tags: readonly string[];
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
    await ragIngest({
      workspace: this.name,
      doc: {
        id: input.memoryId,
        text: input.body,
        metadata: {
          memoryId: input.memoryId,
          tags: input.tags.join(","),
          ...(input.metadata ?? {}),
        },
      },
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

  private ensureOpen(): void {
    if (this.closed) {
      throw new Error(`workspace ${this.name} is closed`);
    }
  }
}
