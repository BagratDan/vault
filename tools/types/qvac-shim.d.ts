// Ambient declarations for symbols @qvac/sdk re-exports via extension-less
// relative paths in its dist/index.d.ts. NodeNext module resolution refuses
// to follow those re-exports, so TypeScript reports TS2305 even though the
// runtime imports work fine (verified by vitest + direct node import).
//
// We declare ONLY the surface Vault actually uses, with permissive shapes —
// downstream code passes these values through to QVAC unchanged.
declare module "@qvac/sdk" {
  // Provider lifecycle
  export function startQVACProvider(): Promise<void>;
  export function stopQVACProvider(): Promise<void>;
  export function state(): Promise<unknown>;
  export function heartbeat(): Promise<unknown>;

  // Model lifecycle
  export function loadModel(opts: {
    modelSrc: unknown;
    modelType: string;
    onProgress?: (p: unknown) => void;
  }): Promise<{ modelId: string } & Record<string, unknown>>;
  export function unloadModel(opts: { modelId: string }): Promise<void>;

  // Inference workloads
  export function completion(opts: {
    modelId: string;
    history: ReadonlyArray<{ role: string; content: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{
    tokenStream: AsyncIterable<string>;
    final?: { text: string };
  }>;

  export function transcribe(opts: { audio: Uint8Array } | Record<string, unknown>): Promise<{
    segments: ReadonlyArray<{
      text: string;
      startMs: number;
      endMs: number;
      confidence: number;
      speaker?: string;
    }>;
    durationMs: number;
  }>;

  export function embed(opts: { input: string | string[] } | Record<string, unknown>): Promise<{
    embeddings: number[][];
  }>;

  export function textToSpeechStream(opts: {
    modelId: string;
    text: string;
  } | Record<string, unknown>): Promise<{
    audioStream: AsyncIterable<Uint8Array>;
  }>;

  // RAG primitives
  export function ragIngest(opts: {
    workspace: string;
    doc: {
      id: string;
      text: string;
      metadata?: Record<string, string>;
    };
  } | Record<string, unknown>): Promise<{ id: string }>;

  export function ragSearch(opts: {
    workspace: string;
    query: string;
    limit: number;
  } | Record<string, unknown>): Promise<{
    results: Array<{
      id: string;
      score: number;
      snippet: string;
      metadata: Record<string, string>;
    }>;
  }>;

  export function ragReindex(opts: { workspace: string } | Record<string, unknown>): Promise<{
    workspace: string;
    reindexed: number;
  }>;

  export function ragCloseWorkspace(opts: { workspace: string } | Record<string, unknown>): Promise<void>;
  export function ragDeleteWorkspace(opts: { workspace: string } | Record<string, unknown>): Promise<void>;

  // Model registry constants (subset Vault pins)
  export const LLAMA_3_2_1B_INST_Q4_0: Readonly<Record<string, unknown>>;
  export const EMBEDDINGGEMMA_300M_Q4_0: Readonly<Record<string, unknown>>;
  export const TTS_EN_ES_CHATTERBOX_Q4F16: Readonly<Record<string, unknown>>;
  export const PARAKEET_TDT_ENCODER_INT8: Readonly<Record<string, unknown>>;
  export const PARAKEET_TDT_DECODER_INT8: Readonly<Record<string, unknown>>;
  export const PARAKEET_TDT_PREPROCESSOR_INT8: Readonly<Record<string, unknown>>;
  export const PARAKEET_TDT_VOCAB: Readonly<Record<string, unknown>>;
}
