import { embed } from "@qvac/sdk";
import { VAULT_MODELS } from "./models.js";
import { ModelPool } from "./model-pool.js";

export async function embedText(pool: ModelPool, input: string): Promise<number[]>;
export async function embedText(pool: ModelPool, input: string[]): Promise<number[][]>;
export async function embedText(
  pool: ModelPool,
  input: string | string[]
): Promise<number[] | number[][]> {
  return pool.withModel(
    {
      id: "embedding-gemma-300m-q4_0",
      size: "small",
      src: VAULT_MODELS.embed,
      type: "embedding",
    },
    async () => {
      const result = await embed({ input });
      if (Array.isArray(input)) return result.embeddings;
      return result.embeddings[0]!;
    }
  );
}
