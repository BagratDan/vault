import { textToSpeech } from "@qvac/sdk";
import { VAULT_MODELS } from "./models.js";
import { ModelPool, type ModelHandle } from "./model-pool.js";

const TTS_HANDLE: ModelHandle = {
  id: "chatterbox-q4f16",
  size: "large" as const,
  src: VAULT_MODELS.tts,
};

// Stream PCM samples as 16-bit little-endian Uint8Array chunks suitable
// for client-side playback. The SDK's bufferStream yields *individual*
// numeric samples; we batch them into ~4 KB chunks to amortize WS overhead.
const SAMPLE_BATCH = 2048;

function samplesToPcm16le(samples: readonly number[]): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i++) {
    // Clamp [-1, 1] then scale to int16
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(i * 2, Math.round(s * 0x7fff), true);
  }
  return out;
}

export async function* synthesizeStream(
  pool: ModelPool,
  text: string
): AsyncGenerator<Uint8Array, void, void> {
  const result = await pool.withModel(TTS_HANDLE, async (modelId) => {
    return textToSpeech({ modelId, text, stream: true });
  });
  let batch: number[] = [];
  for await (const sample of result.bufferStream) {
    batch.push(sample);
    if (batch.length >= SAMPLE_BATCH) {
      yield samplesToPcm16le(batch);
      batch = [];
    }
  }
  if (batch.length > 0) {
    yield samplesToPcm16le(batch);
  }
  await result.done;
}
