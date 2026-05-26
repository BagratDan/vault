import { textToSpeechStream } from "@qvac/sdk";
import { VAULT_MODELS } from "./models.js";
import { ModelPool } from "./model-pool.js";

const TTS_HANDLE = {
  id: "chatterbox-q4f16",
  size: "large" as const,
  src: VAULT_MODELS.tts,
  type: "tts" as const,
};

export async function* synthesizeStream(
  pool: ModelPool,
  text: string
): AsyncGenerator<Uint8Array, void, void> {
  const session = await pool.withModel(TTS_HANDLE, async (loaded) => {
    return textToSpeechStream({
      modelId: loaded.modelId,
      text,
    });
  });
  for await (const chunk of session.audioStream) {
    yield chunk;
  }
}
