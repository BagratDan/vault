import { transcribe } from "@qvac/sdk";
import type { Transcript, TranscriptSegment } from "@vault/domain";
import { VAULT_MODELS } from "./models.js";
import { ModelPool } from "./model-pool.js";

export interface TranscribeOptions {
  /** Segments below this confidence are marked [low-confidence]. Default 0.4. */
  lowConfidenceThreshold?: number;
}

export async function transcribeAudio(
  pool: ModelPool,
  audio: Uint8Array,
  opts: TranscribeOptions = {}
): Promise<Transcript> {
  const threshold = opts.lowConfidenceThreshold ?? 0.4;
  // STT models are small; co-reside with whatever's loaded.
  return pool.withModel(
    {
      id: "parakeet-tdt-int8",
      size: "small",
      src: {
        encoder: VAULT_MODELS.sttEncoder,
        decoder: VAULT_MODELS.sttDecoder,
        preprocessor: VAULT_MODELS.sttPreprocessor,
        vocab: VAULT_MODELS.sttVocab,
      },
      type: "stt",
    },
    async () => {
      const result = await transcribe({ audio });
      const segments: TranscriptSegment[] = result.segments.map((s) => {
        // Keep the words; prefix a marker so downstream extraction and the
        // UI can flag uncertainty without losing the actual transcription
        // (spec §9.3 step 2: segments are "kept but marked").
        const marker =
          s.confidence <= 0
            ? "[INAUDIBLE] "
            : s.confidence < threshold
              ? "[low-confidence] "
              : "";
        return {
          text: marker + s.text,
          startMs: s.startMs,
          endMs: s.endMs,
          confidence: s.confidence,
          ...(s.speaker !== undefined ? { speaker: s.speaker } : {}),
        };
      });
      return { segments, durationMs: result.durationMs };
    }
  );
}
