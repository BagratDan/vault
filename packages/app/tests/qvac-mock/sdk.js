// Mock implementation of @qvac/sdk v0.11.0 for E2E.
// Loaded by qvac-mock/loader.mjs when VAULT_QVAC_MOCK=1.
// Mirrors the REAL SDK surface — see tools/types/qvac-shim.d.ts.

export const startQVACProvider = async () => undefined;
export const stopQVACProvider = async () => undefined;
export const state = async () => ({ lifecycle: "running" });
export const heartbeat = async () => undefined;

// loadModel returns a string (the SDK-assigned modelId).
export const loadModel = async (opts) => {
  // Differentiate by descriptor so the test can match modelId-keyed traffic.
  const src = opts?.modelSrc;
  if (src && typeof src === "object") {
    if ("id" in src) return `mock-${src.id}`;
    if ("encoder" in src) return "mock-parakeet";
  }
  return "mock";
};
export const unloadModel = async () => undefined;

// completion returns a CompletionRun with text/final/events/tokenStream.
export const completion = (opts) => {
  const last = opts.history[opts.history.length - 1]?.content ?? "";
  const text = last.includes("Snippets:")
    ? "Sarah promised to ship the migration by Friday. [1]"
    : JSON.stringify({
        summary: "Sarah promised migration by Friday",
        body: "Sarah said she'd ship by Friday.",
        confidence: 0.9,
        tags: ["commitment"],
        people: [{ displayName: "Sarah", aliases: [] }],
        places: [],
        events: [],
        tasks: [],
        externalRefs: [],
      });
  const tokenStream = (async function* () {
    yield text;
  })();
  const events = (async function* () {})();
  return {
    requestId: "mock-req",
    events,
    final: Promise.resolve({
      contentText: text,
      raw: { fullText: text },
    }),
    text: Promise.resolve(text),
    tokenStream,
  };
};

// transcribe returns Promise<string> by default, Promise<TranscribeSegment[]> with metadata: true.
export const transcribe = async (opts) => {
  if (opts?.metadata === true) {
    return [
      {
        text: "hello team",
        startMs: 0,
        endMs: 1000,
        confidence: 0.9,
      },
    ];
  }
  return "hello team";
};

// embed returns { embedding: number[] } for single input, { embedding: number[][] } for array.
export const embed = async (opts) => {
  const text = opts?.text;
  if (Array.isArray(text)) {
    return { embedding: text.map(() => Array(384).fill(0.1)) };
  }
  return { embedding: Array(384).fill(0.1) };
};

// textToSpeech yields PCM samples; returns { bufferStream, buffer, done }.
export const textToSpeech = (_opts) => {
  const samples = [0.1, 0.2, 0.3, 0.4, 0.5];
  const bufferStream = (async function* () {
    for (const s of samples) yield s;
  })();
  return {
    bufferStream,
    buffer: Promise.resolve(samples),
    done: Promise.resolve(true),
  };
};
// Keep textToSpeechStream as a stub so any consumer still importing it
// doesn't fail to resolve.
export const textToSpeechStream = async () => ({
  audioStream: (async function* () {
    yield new Uint8Array([1, 2, 3]);
  })(),
});

// RAG: segregated flow (chunk → embed → saveEmbeddings) is what Vault uses.
// ragSaveEmbeddings receives [{ id, content, embedding, embeddingModelId, metadata }].
const ragStore = new Map();
export const ragSaveEmbeddings = async (opts) => {
  const results = [];
  for (const doc of opts?.documents ?? []) {
    ragStore.set(`${opts.workspace ?? "default"}/${doc.id}`, doc);
    results.push({ status: "fulfilled", id: doc.id });
  }
  return results;
};
// ragSearch returns SearchResult[] — { id, content, score }.
export const ragSearch = async (opts) => {
  const ws = opts?.workspace ?? "default";
  const prefix = `${ws}/`;
  const matches = [];
  for (const [key, doc] of ragStore) {
    if (key.startsWith(prefix)) {
      matches.push({
        id: doc.id,
        content: doc.content,
        score: 0.9,
      });
    }
  }
  if (matches.length === 0) {
    // Default mock hit so search/answer tests still produce content.
    return [
      {
        id: "mem-1",
        content: "Sarah promised migration by Friday",
        score: 0.9,
      },
    ];
  }
  const topK = opts?.topK ?? 5;
  return matches.slice(0, topK);
};
export const ragIngest = async () => ({ processed: [], droppedIndices: [] });
export const ragDeleteEmbeddings = async () => undefined;
export const ragReindex = async () => ({ reindexed: false, details: { reason: "mock" } });
export const ragCloseWorkspace = async () => undefined;
export const ragDeleteWorkspace = async () => undefined;

// Model registry constants — opaque to Vault, only passed to loadModel.
export const LLAMA_3_2_1B_INST_Q4_0 = { id: "llm" };
export const EMBEDDINGGEMMA_300M_Q4_0 = { id: "emb" };
export const TTS_EN_ES_CHATTERBOX_Q4F16 = { id: "tts" };
export const PARAKEET_TDT_ENCODER_INT8 = { id: "p-enc" };
export const PARAKEET_TDT_DECODER_INT8 = { id: "p-dec" };
export const PARAKEET_TDT_PREPROCESSOR_INT8 = { id: "p-pre" };
export const PARAKEET_TDT_VOCAB = { id: "p-vocab" };
