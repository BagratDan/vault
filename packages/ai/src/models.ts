// packages/ai/src/models.ts
// Pinned model registry references Vault uses.
// All choices reflect @qvac/sdk v0.11.0 registry (see docs/superpowers/notes/2026-05-26-qvac-spike.md).
// LLM is Qwen3 4B (was Llama 3.2 1B) — see docs/superpowers/specs/2026-05-27-llm-model-switch-design.md.
// Type shapes for these constants come from ./qvac-shim.d.ts.
import {
  QWEN3_4B_INST_Q4_K_M,
  EMBEDDINGGEMMA_300M_Q4_0,
  TTS_EN_ES_CHATTERBOX_Q4F16,
  PARAKEET_TDT_ENCODER_INT8,
  PARAKEET_TDT_DECODER_INT8,
  PARAKEET_TDT_PREPROCESSOR_INT8,
  PARAKEET_TDT_VOCAB,
} from "@qvac/sdk";

export const VAULT_MODELS = {
  llm: QWEN3_4B_INST_Q4_K_M,
  embed: EMBEDDINGGEMMA_300M_Q4_0,
  tts: TTS_EN_ES_CHATTERBOX_Q4F16,
  // Parakeet TDT INT8 is multi-file; orchestration treats it as a single
  // logical "stt" target and loads the four files together.
  sttEncoder: PARAKEET_TDT_ENCODER_INT8,
  sttDecoder: PARAKEET_TDT_DECODER_INT8,
  sttPreprocessor: PARAKEET_TDT_PREPROCESSOR_INT8,
  sttVocab: PARAKEET_TDT_VOCAB,
} as const;

export type VaultModelKey = keyof typeof VAULT_MODELS;
