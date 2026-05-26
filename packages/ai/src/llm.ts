import { completion } from "@qvac/sdk";
import { VAULT_MODELS } from "./models.js";
import { ModelPool, type ModelHandle } from "./model-pool.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const LLM_HANDLE: ModelHandle = {
  id: "llama-3.2-1b-inst-q4_0",
  size: "large" as const,
  src: VAULT_MODELS.llm,
};

export async function complete(
  pool: ModelPool,
  history: ChatMessage[]
): Promise<string> {
  return pool.withModel(LLM_HANDLE, async (modelId) => {
    const run = completion({ modelId, history });
    return run.text;
  });
}

export async function* completeStream(
  pool: ModelPool,
  history: ChatMessage[]
): AsyncGenerator<string, void, void> {
  const run = await pool.withModel(LLM_HANDLE, async (modelId) => {
    return completion({ modelId, history });
  });
  for await (const tok of run.tokenStream) {
    yield tok;
  }
}
