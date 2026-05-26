import { embed } from "@qvac/sdk";
import { VAULT_MODELS } from "./models.js";
import { ModelPool, type ModelHandle } from "./model-pool.js";

const EMBED_HANDLE: ModelHandle = {
  id: "embedding-gemma-300m-q4_0",
  size: "small" as const,
  src: VAULT_MODELS.embed,
};

/** Returns the embedding model's SDK-assigned modelId. Cached after first load. */
export async function ensureEmbedModel(pool: ModelPool): Promise<string> {
  return pool.ensure(EMBED_HANDLE);
}

export async function embedText(pool: ModelPool, input: string): Promise<number[]>;
export async function embedText(pool: ModelPool, input: string[]): Promise<number[][]>;
export async function embedText(
  pool: ModelPool,
  input: string | string[]
): Promise<number[] | number[][]> {
  return pool.withModel(EMBED_HANDLE, async (modelId) => {
    if (Array.isArray(input)) {
      const r = await embed({ modelId, text: input });
      return r.embedding;
    }
    const r = await embed({ modelId, text: input });
    return r.embedding;
  });
}
