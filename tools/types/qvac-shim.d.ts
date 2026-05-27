// Ambient declarations for symbols @qvac/sdk re-exports via extension-less
// relative paths in its dist/index.d.ts. NodeNext module resolution refuses
// to follow those re-exports, so TypeScript reports TS2305 even though the
// runtime imports work fine.
//
// These shapes match the REAL SDK v0.11.0 runtime contract documented in
// the dist/.d.ts files. Verified against
// node_modules/.../@qvac/sdk/dist/client/api/*.d.ts.
declare module "@qvac/sdk" {
  // Provider lifecycle
  export function startQVACProvider(): Promise<void>;
  export function stopQVACProvider(): Promise<void>;
  export function state(): Promise<unknown>;
  export function heartbeat(): Promise<unknown>;

  // Model lifecycle. loadModel returns the modelId STRING (decorated with
  // a synchronous .requestId for cancel()). modelType is inferred from
  // modelSrc when it's a registry-constant descriptor.
  export function loadModel(opts: {
    modelSrc: unknown;
    modelType?: string;
    modelConfig?: Record<string, unknown>;
    onProgress?: (p: unknown) => void;
  }): Promise<string>;
  export function unloadModel(opts: { modelId: string }): Promise<void>;

  // Completion. Returns CompletionRun — events / final are canonical;
  // .text is the legacy convenience (Promise<string>).
  export interface CompletionRun {
    requestId: string;
    events: AsyncIterable<unknown>;
    final: Promise<{
      contentText: string;
      thinkingText?: string;
      raw: { fullText: string };
    }>;
    text: Promise<string>;
    tokenStream: AsyncGenerator<string>;
  }
  export function completion(opts: {
    modelId: string;
    history: ReadonlyArray<{ role: string; content: string }>;
    stream?: boolean;
  }): CompletionRun;

  // Transcribe. Params use `audioChunk` (file path OR audio buffer).
  // Returns joined text by default; `metadata: true` returns segments.
  export interface TranscribeSegment {
    text: string;
    startMs: number;
    endMs: number;
    confidence?: number;
    speaker?: string;
  }
  export function transcribe(opts: {
    modelId: string;
    audioChunk: Uint8Array | string;
    prompt?: string;
    metadata?: false;
  }): Promise<string>;
  export function transcribe(opts: {
    modelId: string;
    audioChunk: Uint8Array | string;
    prompt?: string;
    metadata: true;
  }): Promise<TranscribeSegment[]>;

  // Embed. Single text -> { embedding: number[] }; array -> number[][].
  export function embed(opts: { modelId: string; text: string }): Promise<{
    embedding: number[];
  }>;
  export function embed(opts: { modelId: string; text: string[] }): Promise<{
    embedding: number[][];
  }>;

  // TTS — one-shot synth that yields PCM samples (numbers, not bytes).
  export interface TextToSpeechStreamResult {
    bufferStream: AsyncGenerator<number>;
    buffer: Promise<number[]>;
    done: Promise<boolean>;
  }
  export function textToSpeech(opts: {
    modelId: string;
    text: string;
    stream?: boolean;
  }): TextToSpeechStreamResult;

  // RAG primitives. All require modelId (the embedding model) to be loaded.
  // The "segregated flow" (chunk → embed → saveEmbeddings) is the only
  // path that lets us pass our own document ids and metadata; ragIngest
  // string-mode auto-generates ids which doesn't fit Vault's memoryId
  // contract.
  export interface RagEmbeddedDoc {
    id: string;
    content: string;
    embedding: number[];
    embeddingModelId: string;
    metadata?: Record<string, unknown>;
  }
  export function ragSaveEmbeddings(opts: {
    workspace?: string;
    documents: RagEmbeddedDoc[];
    modelId?: string;
  }): Promise<
    Array<{ status: "fulfilled" | "rejected"; id?: string; error?: string }>
  >;

  export interface RagSearchResultItem {
    id: string;
    content: string;
    score: number;
  }
  export function ragSearch(opts: {
    modelId: string;
    query: string;
    topK?: number;
    workspace?: string;
  }): Promise<RagSearchResultItem[]>;

  export function ragDeleteEmbeddings(opts: {
    modelId?: string;
    workspace?: string;
    ids: string[];
  }): Promise<void>;

  export function ragReindex(opts: { workspace?: string }): Promise<{
    reindexed: boolean;
    details?: { reason?: string };
  }>;
  export function ragCloseWorkspace(opts: { workspace?: string }): Promise<void>;
  export function ragDeleteWorkspace(opts: { workspace?: string }): Promise<void>;

  // Model registry constants Vault pins. Real shapes are complex literal
  // objects with name, src, engine, etc. — we only pass them through.
  export const LLAMA_3_2_1B_INST_Q4_0: Readonly<Record<string, unknown>>;
  export const QWEN3_4B_INST_Q4_K_M: Readonly<Record<string, unknown>>;
  export const EMBEDDINGGEMMA_300M_Q4_0: Readonly<Record<string, unknown>>;
  export const TTS_EN_ES_CHATTERBOX_Q4F16: Readonly<Record<string, unknown>>;
  export const PARAKEET_TDT_ENCODER_INT8: Readonly<Record<string, unknown>>;
  export const PARAKEET_TDT_DECODER_INT8: Readonly<Record<string, unknown>>;
  export const PARAKEET_TDT_PREPROCESSOR_INT8: Readonly<Record<string, unknown>>;
  export const PARAKEET_TDT_VOCAB: Readonly<Record<string, unknown>>;
}
