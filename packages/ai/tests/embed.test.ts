import { describe, expect, it, beforeEach, vi } from "vitest";
import { embedText } from "../src/embed.js";
import { ModelPool } from "../src/model-pool.js";

// Real SDK contract: embed({ modelId, text }) → { embedding: number[] }
// (single) or { embedding: number[][] } (array).
vi.mock("@qvac/sdk", () => ({
  loadModel: vi.fn(async () => "emb-gemma"),
  unloadModel: vi.fn().mockResolvedValue(undefined),
  embed: vi.fn(async (opts: { text: string | string[] }) => {
    if (Array.isArray(opts.text)) {
      return { embedding: opts.text.map(() => Array(384).fill(0.1)) };
    }
    return { embedding: Array(384).fill(0.1) };
  }),
  LLAMA_3_2_1B_INST_Q4_0: { id: "llm" },
  EMBEDDINGGEMMA_300M_Q4_0: { id: "emb" },
  TTS_EN_ES_CHATTERBOX_Q4F16: { id: "tts" },
  PARAKEET_TDT_ENCODER_INT8: { id: "p-enc" },
  PARAKEET_TDT_DECODER_INT8: { id: "p-dec" },
  PARAKEET_TDT_PREPROCESSOR_INT8: { id: "p-pre" },
  PARAKEET_TDT_VOCAB: { id: "p-vocab" },
}));

describe("embedText", () => {
  let pool: ModelPool;
  beforeEach(() => {
    pool = new ModelPool({ memoryPressureFloor: 0.95 });
    vi.clearAllMocks();
  });

  it("returns a single 384-dim vector for a string", async () => {
    const vec = await embedText(pool, "hello");
    expect(vec).toHaveLength(384);
    expect((vec as number[])[0]).toBeCloseTo(0.1);
  });

  it("batches: array input returns array of vectors of the same length", async () => {
    const vecs = await embedText(pool, ["a", "b", "c"]);
    expect(vecs).toHaveLength(3);
    expect((vecs as number[][])[0]).toHaveLength(384);
  });
});
