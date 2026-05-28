import { describe, expect, it, vi } from "vitest";

vi.mock("@vault/ai", () => ({
  ensureEmbedModel: vi.fn(async () => "embed-model-id"),
  embedText: vi.fn(async () => new Array(8).fill(0.1)),
}));

import { chunkAndEmbed } from "../src/chunk-embed.js";

function memOf(body: string) {
  return {
    id: "01J0MEM0000000000000000000",
    createdAt: "2026-05-27T10:00:00.000Z",
    updatedAt: "2026-05-27T10:00:00.000Z",
    ownerPeerId: "a".repeat(64),
    provenance: { kind: "extraction" as const },
    summary: body.slice(0, 50),
    body,
    sourceRecordId: "01J0SRC0000000000000000000",
    confidence: 0.5,
    tags: ["t"] as string[],
    requestableScopes: ["metadata", "snippet", "file"] as Array<"metadata" | "snippet" | "file">,
    folderId: "01J0FLD0000000000000000000",
  };
}

describe("chunkAndEmbed", () => {
  it("ingests one chunk for a short body, keyed #0", async () => {
    const ingest = vi.fn(async () => undefined);
    const ws = { ingest, getName: () => "ws" } as never;
    const r = await chunkAndEmbed({ pool: {} as never, workspace: ws, ownerPeerId: "a".repeat(64) }, memOf("short body"));
    expect(r).toEqual({ chunks: 1, embedded: 1, errors: 0 });
    expect(ingest).toHaveBeenCalledTimes(1);
    expect((ingest.mock.calls[0]![0] as { memoryId: string }).memoryId).toBe("01J0MEM0000000000000000000#0");
  });

  it("ingests N chunks for a long body, keyed #0..#N-1, all carry parent id", async () => {
    const ingest = vi.fn(async () => undefined);
    const ws = { ingest, getName: () => "ws" } as never;
    const longBody = "word ".repeat(2000); // ~10000 chars → multiple chunks
    const r = await chunkAndEmbed({ pool: {} as never, workspace: ws, ownerPeerId: "a".repeat(64) }, memOf(longBody));
    expect(r.chunks).toBeGreaterThan(1);
    expect(r.embedded).toBe(r.chunks);
    const ids = ingest.mock.calls.map((c) => (c[0] as { memoryId: string }).memoryId);
    expect(ids[0]).toBe("01J0MEM0000000000000000000#0");
    expect(ids.every((id) => id.startsWith("01J0MEM0000000000000000000#"))).toBe(true);
  });

  it("skips a chunk whose embed throws but indexes the rest", async () => {
    const ai = await import("@vault/ai");
    let call = 0;
    (ai.embedText as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      call++;
      if (call === 1) throw new Error("batch overflow");
      return new Array(8).fill(0.1);
    });
    const ingest = vi.fn(async () => undefined);
    const ws = { ingest, getName: () => "ws" } as never;
    const r = await chunkAndEmbed({ pool: {} as never, workspace: ws, ownerPeerId: "a".repeat(64) }, memOf("word ".repeat(2000)));
    expect(r.errors).toBe(1);
    expect(r.embedded).toBe(r.chunks - 1);
    expect(ingest).toHaveBeenCalledTimes(r.chunks - 1);
  });

  it("returns zeros for an empty body", async () => {
    const ingest = vi.fn(async () => undefined);
    const ws = { ingest, getName: () => "ws" } as never;
    const r = await chunkAndEmbed({ pool: {} as never, workspace: ws, ownerPeerId: "a".repeat(64) }, memOf("   "));
    expect(r).toEqual({ chunks: 0, embedded: 0, errors: 0 });
    expect(ingest).not.toHaveBeenCalled();
  });
});
