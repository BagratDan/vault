// packages/ai/src/models.ts
// Re-export the named-constant model references Vault pins to.
// All choices reflect @qvac/sdk v0.11.0 registry (see docs/superpowers/notes/2026-05-26-qvac-spike.md).
//
// Note: @qvac/sdk re-exports model registry constants via extension-less
// `export * from "./models/registry/index"` in its d.ts, which TypeScript's
// NodeNext module resolver cannot follow. The @ts-ignore pragmas below suppress
// the false-positive TS2305 errors; the imports resolve correctly at runtime
// (verified by vitest run and direct node --input-type=module import).
// skipcq: JS-0356

// @ts-ignore TS2305 – see note above
import { LLAMA_3_2_1B_INST_Q4_0 } from "@qvac/sdk";
// @ts-ignore TS2305 – see note above
import { EMBEDDINGGEMMA_300M_Q4_0 } from "@qvac/sdk";
// @ts-ignore TS2305 – see note above
import { TTS_EN_ES_CHATTERBOX_Q4F16 } from "@qvac/sdk";
// @ts-ignore TS2305 – see note above
import { PARAKEET_TDT_ENCODER_INT8 } from "@qvac/sdk";
// @ts-ignore TS2305 – see note above
import { PARAKEET_TDT_DECODER_INT8 } from "@qvac/sdk";
// @ts-ignore TS2305 – see note above
import { PARAKEET_TDT_PREPROCESSOR_INT8 } from "@qvac/sdk";
// @ts-ignore TS2305 – see note above
import { PARAKEET_TDT_VOCAB } from "@qvac/sdk";

export const VAULT_MODELS = {
  llm: LLAMA_3_2_1B_INST_Q4_0 as unknown,
  embed: EMBEDDINGGEMMA_300M_Q4_0 as unknown,
  tts: TTS_EN_ES_CHATTERBOX_Q4F16 as unknown,
  // Parakeet TDT INT8 is multi-file; the orchestration layer treats it
  // as a single logical "stt" target and loads the four files together.
  sttEncoder: PARAKEET_TDT_ENCODER_INT8 as unknown,
  sttDecoder: PARAKEET_TDT_DECODER_INT8 as unknown,
  sttPreprocessor: PARAKEET_TDT_PREPROCESSOR_INT8 as unknown,
  sttVocab: PARAKEET_TDT_VOCAB as unknown,
} as const;

export type VaultModelKey = keyof typeof VAULT_MODELS;
