import { describe, expect, it, vi, beforeEach } from "vitest";
import { transcribeAudio } from "../src/transcribe.js";
import { ModelPool } from "../src/model-pool.js";

const segments = [
  { text: "Hello team", startMs: 0, endMs: 800, confidence: 0.95, speaker: "A" },
  { text: "mumble", startMs: 800, endMs: 1200, confidence: 0.2, speaker: "A" },
];

// Real SDK contract:
//   transcribe({ modelId, audioChunk, metadata: true }) → Promise<TranscribeSegment[]>
//   transcribe({ modelId, audioChunk })                → Promise<string>
vi.mock("@qvac/sdk", () => ({
  loadModel: vi.fn(async () => "parakeet-tdt"),
  unloadModel: vi.fn().mockResolvedValue(undefined),
  transcribe: vi.fn(async (opts: { metadata?: boolean }) => {
    if (opts.metadata === true) return segments;
    return segments.map((s) => s.text).join(" ");
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

describe("transcribeAudio", () => {
  let pool: ModelPool;
  beforeEach(() => {
    pool = new ModelPool({ memoryPressureFloor: 0.95 });
    vi.clearAllMocks();
  });

  it("returns a Transcript with normalized segments", async () => {
    const audio = new Uint8Array([0]);
    const t = await transcribeAudio(pool, audio, { lowConfidenceThreshold: 0.3 });
    expect(t.segments).toHaveLength(2);
    expect(t.segments[0]!.text).toBe("Hello team");
    // Low-confidence segments are kept and PREFIXED so downstream consumers
    // can flag uncertainty without losing the words.
    expect(t.segments[1]!.text).toBe("[low-confidence] mumble");
    expect(t.segments[1]!.confidence).toBe(0.2);
    expect(t.durationMs).toBe(1200);
  });

  it("emits [INAUDIBLE] prefix when a segment has confidence 0", async () => {
    const { transcribe } = await import("@qvac/sdk");
    (transcribe as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { text: "", startMs: 0, endMs: 500, confidence: 0 },
    ]);
    const t = await transcribeAudio(pool, new Uint8Array([0]));
    expect(t.segments[0]!.text).toBe("[INAUDIBLE] ");
  });
});
