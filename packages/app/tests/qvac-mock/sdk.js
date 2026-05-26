// Mock implementation of @qvac/sdk for E2E.
// Loaded by qvac-mock/loader.mjs when VAULT_QVAC_MOCK=1.
export const startQVACProvider = async () => undefined;
export const stopQVACProvider = async () => undefined;
export const state = async () => ({ lifecycle: "running" });
export const heartbeat = async () => undefined;

export const loadModel = async () => ({ modelId: "mock" });
export const unloadModel = async () => undefined;

export const completion = async (opts) => {
  const last = opts.history[opts.history.length - 1]?.content ?? "";
  if (last.includes("Snippets:")) {
    return {
      final: { text: "Sarah promised to ship the migration by Friday. [1]" },
      tokenStream: (async function* () {})(),
    };
  }
  return {
    final: {
      text: JSON.stringify({
        summary: "Sarah promised migration by Friday",
        body: "Sarah said she'd ship by Friday.",
        confidence: 0.9,
        tags: ["commitment"],
        people: [{ displayName: "Sarah", aliases: [] }],
        places: [],
        events: [],
        tasks: [],
        externalRefs: [],
      }),
    },
    tokenStream: (async function* () {})(),
  };
};

export const transcribe = async () => ({
  segments: [{ text: "hello team", startMs: 0, endMs: 1000, confidence: 0.9 }],
  durationMs: 1000,
});

export const embed = async (opts) => {
  const arr = Array.isArray(opts.input) ? opts.input : [opts.input];
  return { embeddings: arr.map(() => Array(384).fill(0.1)) };
};

export const textToSpeechStream = async () => ({
  audioStream: (async function* () {
    yield new Uint8Array([1, 2, 3]);
  })(),
});

export const ragIngest = async () => ({ id: "doc-1" });
export const ragSearch = async () => ({
  results: [
    {
      id: "mem-1",
      score: 0.9,
      snippet: "Sarah promised migration by Friday",
      metadata: { memoryId: "mem-1", tags: "commitment", ownerPeerId: "p1" },
    },
  ],
});
export const ragReindex = async () => ({ workspace: "w", reindexed: 0 });
export const ragCloseWorkspace = async () => undefined;
export const ragDeleteWorkspace = async () => undefined;

export const LLAMA_3_2_1B_INST_Q4_0 = { id: "llm" };
export const EMBEDDINGGEMMA_300M_Q4_0 = { id: "emb" };
export const TTS_EN_ES_CHATTERBOX_Q4F16 = { id: "tts" };
export const PARAKEET_TDT_ENCODER_INT8 = { id: "p-enc" };
export const PARAKEET_TDT_DECODER_INT8 = { id: "p-dec" };
export const PARAKEET_TDT_PREPROCESSOR_INT8 = { id: "p-pre" };
export const PARAKEET_TDT_VOCAB = { id: "p-vocab" };
