import { describe, expect, it, beforeEach, vi } from "vitest";
import { synthesizeStream } from "../src/tts.js";
import { ModelPool } from "../src/model-pool.js";

vi.mock("@qvac/sdk", () => ({
  loadModel: vi.fn().mockResolvedValue({ modelId: "chatterbox" }),
  unloadModel: vi.fn().mockResolvedValue(undefined),
  textToSpeechStream: vi.fn(async () => ({
    audioStream: (async function* () {
      yield new Uint8Array([1, 2, 3]);
      yield new Uint8Array([4, 5]);
    })(),
  })),
  LLAMA_3_2_1B_INST_Q4_0: { id: "llm" },
  EMBEDDINGGEMMA_300M_Q4_0: { id: "emb" },
  TTS_EN_ES_CHATTERBOX_Q4F16: { id: "tts" },
  PARAKEET_TDT_ENCODER_INT8: { id: "p-enc" },
  PARAKEET_TDT_DECODER_INT8: { id: "p-dec" },
  PARAKEET_TDT_PREPROCESSOR_INT8: { id: "p-pre" },
  PARAKEET_TDT_VOCAB: { id: "p-vocab" },
}));

describe("synthesizeStream", () => {
  let pool: ModelPool;
  beforeEach(() => {
    pool = new ModelPool({ memoryPressureFloor: 0.95 });
    vi.clearAllMocks();
  });

  it("yields audio chunks", async () => {
    const chunks: Uint8Array[] = [];
    for await (const c of synthesizeStream(pool, "hello")) {
      chunks.push(c);
    }
    expect(chunks).toHaveLength(2);
    expect(Array.from(chunks[0]!)).toEqual([1, 2, 3]);
  });
});
