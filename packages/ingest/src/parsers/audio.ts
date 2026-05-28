import { transcribeAudio, type ModelPool } from "@vault/ai";

export interface AudioParseDeps {
  pool: ModelPool;
}

/**
 * Transcribe an audio file by delegating to @vault/ai's existing
 * transcribeAudio (Parakeet). Returns the concatenated transcript text;
 * segment metadata is dropped for ingest purposes (the Memory body is
 * what gets embedded). The raw audio bytes are NOT stored here — caller
 * (folder-ingest worker) is responsible for writing them to
 * $VAULT_ROOT/audio/<id>.bin, mirroring the Plan 1 capture.audio path.
 */
export async function parseAudio(
  deps: AudioParseDeps,
  buf: Uint8Array
): Promise<string> {
  const transcript = await transcribeAudio(deps.pool, buf);
  return transcript.segments.map((s) => s.text).join(" ");
}
