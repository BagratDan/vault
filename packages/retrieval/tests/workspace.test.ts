import { describe, expect, it, beforeEach, vi } from "vitest";
import { Workspace, workspaceName } from "../src/workspace.js";

const ingestedDocs: unknown[] = [];

vi.mock("@qvac/sdk", () => ({
  ragIngest: vi.fn(async (opts: { workspace: string; doc: unknown }) => {
    ingestedDocs.push(opts.doc);
    return { id: `doc-${ingestedDocs.length}` };
  }),
  ragCloseWorkspace: vi.fn(async () => undefined),
  ragDeleteWorkspace: vi.fn(async () => undefined),
}));

describe("Workspace", () => {
  beforeEach(() => {
    ingestedDocs.length = 0;
    vi.clearAllMocks();
  });

  it("workspaceName derives a stable short name from a peer ID", () => {
    const peerId = "abcdef0123456789".repeat(4);
    expect(workspaceName(peerId)).toBe("vault-abcdef");
  });

  it("ingest() forwards to ragIngest with the correct workspace name", async () => {
    const peerId = "abcdef0123456789".repeat(4);
    const ws = new Workspace(peerId);
    await ws.ingest({
      memoryId: "01J0".padEnd(26, "A") as never,
      body: "hello world",
      tags: ["greeting"],
    });
    expect(ingestedDocs).toHaveLength(1);
    const { ragIngest } = await import("@qvac/sdk");
    expect((ragIngest as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatchObject({
      workspace: "vault-abcdef",
    });
  });

  it("close() closes the workspace via ragCloseWorkspace", async () => {
    const ws = new Workspace("a".repeat(64));
    await ws.close();
    const { ragCloseWorkspace } = await import("@qvac/sdk");
    expect(ragCloseWorkspace).toHaveBeenCalled();
  });
});
