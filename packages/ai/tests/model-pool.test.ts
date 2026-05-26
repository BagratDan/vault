import { describe, expect, it, beforeEach, vi } from "vitest";
import { ModelPool, type ModelHandle } from "../src/model-pool.js";

const loadCalls: string[] = [];
const unloadCalls: string[] = [];

// Real SDK contract: loadModel returns Promise<string> (the modelId).
vi.mock("@qvac/sdk", () => ({
  loadModel: vi.fn(async (opts: { modelSrc: { id: string } }) => {
    loadCalls.push(opts.modelSrc.id);
    return opts.modelSrc.id;
  }),
  unloadModel: vi.fn(async (opts: { modelId: string }) => {
    unloadCalls.push(opts.modelId);
  }),
}));

const largeHandle = (id: string): ModelHandle => ({
  id,
  size: "large",
  src: { id },
});
const smallHandle = (id: string): ModelHandle => ({
  id,
  size: "small",
  src: { id },
});

describe("ModelPool", () => {
  beforeEach(() => {
    loadCalls.length = 0;
    unloadCalls.length = 0;
    vi.clearAllMocks();
  });

  it("loads a model on demand and reuses it on subsequent calls", async () => {
    const pool = new ModelPool({ memoryPressureFloor: 0.95 });
    const result1 = await pool.withModel(
      largeHandle("llm-a"),
      async (id) => id
    );
    const result2 = await pool.withModel(
      largeHandle("llm-a"),
      async (id) => id
    );
    expect(result1).toBe("llm-a");
    expect(result2).toBe("llm-a");
    expect(loadCalls).toEqual(["llm-a"]);
  });

  it("unloads the resident large model before loading another large one", async () => {
    const pool = new ModelPool({ memoryPressureFloor: 0.95 });
    await pool.withModel(largeHandle("llm-a"), async () => null);
    await pool.withModel(largeHandle("tts-b"), async () => null);
    expect(loadCalls).toEqual(["llm-a", "tts-b"]);
    expect(unloadCalls).toEqual(["llm-a"]);
  });

  it("co-resident small + large: small does not evict large", async () => {
    const pool = new ModelPool({ memoryPressureFloor: 0.95 });
    await pool.withModel(largeHandle("llm-a"), async () => null);
    await pool.withModel(smallHandle("embed-x"), async () => null);
    expect(unloadCalls).toEqual([]);
  });

  it("calls onMemoryPressure when usage exceeds floor", async () => {
    const pressure = vi.fn();
    const pool = new ModelPool({
      memoryPressureFloor: 0.0, // force trigger
      onMemoryPressure: pressure,
    });
    await pool.withModel(largeHandle("llm-a"), async () => null);
    expect(pressure).toHaveBeenCalled();
  });
});
