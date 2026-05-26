import { describe, expect, it, beforeEach, vi } from "vitest";
import { Workspace, workspaceName } from "../src/workspace.js";

const savedDocs: Array<{ workspace?: string; doc: unknown }> = [];

// Workspace.ingest now uses the segregated flow: it calls
// ragSaveEmbeddings with a pre-computed embedding (computed by the
// capture pipeline via @vault/ai's embedText), not ragIngest which
// auto-generates ids that wouldn't map to our memoryIds.
vi.mock("@qvac/sdk", () => ({
  ragSaveEmbeddings: vi.fn(async (opts: { workspace?: string; documents: unknown[] }) => {
    for (const doc of opts.documents) savedDocs.push({ ...(opts.workspace ? { workspace: opts.workspace } : {}), doc });
    return opts.documents.map((d) => ({
      status: "fulfilled" as const,
      id: (d as { id: string }).id,
    }));
  }),
  ragCloseWorkspace: vi.fn(async () => undefined),
  ragDeleteWorkspace: vi.fn(async () => undefined),
}));

describe("Workspace", () => {
  beforeEach(() => {
    savedDocs.length = 0;
    vi.clearAllMocks();
  });

  it("workspaceName derives a stable short name from a peer ID", () => {
    const peerId = "abcdef0123456789".repeat(4);
    expect(workspaceName(peerId)).toBe("vault-abcdef");
  });

  it("ingest() forwards an EmbeddedDoc to ragSaveEmbeddings", async () => {
    const peerId = "abcdef0123456789".repeat(4);
    const ws = new Workspace(peerId);
    await ws.ingest({
      memoryId: "01J0".padEnd(26, "A") as never,
      body: "hello world",
      tags: ["greeting"],
      embedding: Array(384).fill(0.1),
      embeddingModelId: "emb-gemma",
    });
    expect(savedDocs).toHaveLength(1);
    expect(savedDocs[0]!.workspace).toBe("vault-abcdef");
    const doc = savedDocs[0]!.doc as {
      id: string;
      content: string;
      embedding: number[];
      embeddingModelId: string;
      metadata: Record<string, string>;
    };
    expect(doc.id).toMatch(/^01J0A+$/);
    expect(doc.content).toBe("hello world");
    expect(doc.embedding).toHaveLength(384);
    expect(doc.embeddingModelId).toBe("emb-gemma");
    expect(doc.metadata.tags).toBe("greeting");
  });

  it("close() closes the workspace via ragCloseWorkspace", async () => {
    const ws = new Workspace("a".repeat(64));
    await ws.close();
    const { ragCloseWorkspace } = await import("@qvac/sdk");
    expect(ragCloseWorkspace).toHaveBeenCalled();
  });
});
