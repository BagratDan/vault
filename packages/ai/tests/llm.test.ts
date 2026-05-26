import { describe, expect, it, beforeEach, vi } from "vitest";
import { complete, completeStream, type ChatMessage } from "../src/llm.js";
import { ModelPool } from "../src/model-pool.js";

vi.mock("@qvac/sdk", () => ({
  loadModel: vi.fn(async () => "llama"),
  unloadModel: vi.fn().mockResolvedValue(undefined),
  // Real SDK contract: completion(...) returns a CompletionRun synchronously
  // (not a Promise) with `text: Promise<string>`, `tokenStream`, etc.
  completion: vi.fn(() => {
    const tokens = ["Hello", " from", " mock"];
    const joined = "Hello from mock";
    return {
      requestId: "mock-req",
      events: (async function* () {})(),
      final: Promise.resolve({
        contentText: joined,
        raw: { fullText: joined },
      }),
      text: Promise.resolve(joined),
      tokenStream: (async function* () {
        for (const t of tokens) yield t;
      })(),
    };
  }),
  LLAMA_3_2_1B_INST_Q4_0: { id: "llm" },
  EMBEDDINGGEMMA_300M_Q4_0: { id: "emb" },
  TTS_EN_ES_CHATTERBOX_Q4F16: { id: "tts" },
  PARAKEET_TDT_ENCODER_INT8: { id: "p-enc" },
  PARAKEET_TDT_DECODER_INT8: { id: "p-dec" },
  PARAKEET_TDT_PREPROCESSOR_INT8: { id: "p-pre" },
  PARAKEET_TDT_VOCAB: { id: "p-vocab" },
}));

describe("LLM wrapper", () => {
  let pool: ModelPool;
  beforeEach(() => {
    pool = new ModelPool({ memoryPressureFloor: 0.95 });
    vi.clearAllMocks();
  });

  it("complete() returns the final text", async () => {
    const messages: ChatMessage[] = [{ role: "user", content: "Say hi" }];
    const out = await complete(pool, messages);
    expect(out).toBe("Hello from mock");
  });

  it("completeStream() yields tokens in order", async () => {
    const messages: ChatMessage[] = [{ role: "user", content: "Say hi" }];
    const chunks: string[] = [];
    for await (const t of completeStream(pool, messages)) {
      chunks.push(t);
    }
    expect(chunks).toEqual(["Hello", " from", " mock"]);
  });
});
