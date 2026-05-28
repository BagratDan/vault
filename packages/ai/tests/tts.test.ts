import { describe, expect, it, beforeEach, vi } from "vitest";
import { synthesizeStream } from "../src/tts.js";
import { ModelPool } from "../src/model-pool.js";

// Real SDK contract: textToSpeech({ modelId, text, stream: true }) returns
// { bufferStream: AsyncGenerator<number>, buffer, done }. bufferStream
// yields individual PCM samples (floats in [-1, 1]).
vi.mock("@qvac/sdk", () => ({
  loadModel: vi.fn(async () => "chatterbox"),
  unloadModel: vi.fn().mockResolvedValue(undefined),
  textToSpeech: vi.fn(() => {
    // 5 samples -> single 10-byte PCM16 chunk (5 < SAMPLE_BATCH=2048).
    const samples = [0.1, 0.2, 0.3, -0.1, -0.2];
    return {
      bufferStream: (async function* () {
        for (const s of samples) yield s;
      })(),
      buffer: Promise.resolve(samples),
      done: Promise.resolve(true),
    };
  }),
  LLAMA_3_2_1B_INST_Q4_0: { id: "llm" },
  QWEN3_4B_INST_Q4_K_M: { id: "llm" },
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

  it("yields PCM-16 byte chunks", async () => {
    const chunks: Uint8Array[] = [];
    for await (const c of synthesizeStream(pool, "hello")) {
      chunks.push(c);
    }
    // 5 samples → 10 bytes in a single sub-batch chunk.
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.byteLength).toBe(10);
  });
});
