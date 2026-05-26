import { transcribe } from "@qvac/sdk";
import type { Transcript, TranscriptSegment } from "@vault/domain";
import { VAULT_MODELS } from "./models.js";
import { ModelPool, type ModelHandle } from "./model-pool.js";

// Parakeet TDT INT8 is a multi-file descriptor: SDK's parakeet plugin
// accepts a composite shape pointing at the four registry constants.
const STT_HANDLE: ModelHandle = {
  id: "parakeet-tdt-int8",
  size: "small" as const,
  src: {
    encoder: VAULT_MODELS.sttEncoder,
    decoder: VAULT_MODELS.sttDecoder,
    preprocessor: VAULT_MODELS.sttPreprocessor,
    vocab: VAULT_MODELS.sttVocab,
  },
};

export interface TranscribeOptions {
  /** Segments below this confidence are marked [low-confidence]. Default 0.4.
   *  Only applies when per-segment metadata is returned. */
  lowConfidenceThreshold?: number;
}

export async function transcribeAudio(
  pool: ModelPool,
  audio: Uint8Array,
  opts: TranscribeOptions = {}
): Promise<Transcript> {
  const threshold = opts.lowConfidenceThreshold ?? 0.4;
  return pool.withModel(STT_HANDLE, async (modelId) => {
    // Try per-segment metadata first; fall back to joined text if the
    // engine doesn't support it (engine-dependent; Parakeet returns joined).
    try {
      const segments = (await transcribe({
        modelId,
        audioChunk: audio,
        metadata: true,
      })) as Array<{
        text: string;
        startMs: number;
        endMs: number;
        confidence?: number;
        speaker?: string;
      }>;
      const out: TranscriptSegment[] = segments.map((s) => {
        const conf = s.confidence ?? 1;
        const marker =
          conf <= 0
            ? "[INAUDIBLE] "
            : conf < threshold
              ? "[low-confidence] "
              : "";
        const seg: TranscriptSegment = {
          text: marker + s.text,
          startMs: s.startMs,
          endMs: s.endMs,
          confidence: conf,
        };
        if (s.speaker !== undefined) seg.speaker = s.speaker;
        return seg;
      });
      const durationMs = segments.length
        ? segments[segments.length - 1]!.endMs
        : 0;
      return { segments: out, durationMs };
    } catch {
      // Fallback: joined text only.
      const text = await transcribe({ modelId, audioChunk: audio });
      return {
        segments: [
          { text, startMs: 0, endMs: 0, confidence: 1 },
        ],
        durationMs: 0,
      };
    }
  });
}
