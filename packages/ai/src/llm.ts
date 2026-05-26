import { completion } from "@qvac/sdk";
import { VAULT_MODELS } from "./models.js";
import { ModelPool } from "./model-pool.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const LLM_HANDLE = {
  id: "llama-3.2-1b-inst-q4_0",
  size: "large" as const,
  src: VAULT_MODELS.llm,
  type: "llm" as const,
};

export async function complete(
  pool: ModelPool,
  history: ChatMessage[],
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  return pool.withModel(LLM_HANDLE, async (loaded) => {
    const result = await completion({
      modelId: loaded.modelId,
      history,
      temperature: options.temperature ?? 0.2,
      maxTokens: options.maxTokens ?? 512,
    });
    if (result.final?.text) return result.final.text;
    let text = "";
    for await (const tok of result.tokenStream) {
      text += tok;
    }
    return text;
  });
}

export async function* completeStream(
  pool: ModelPool,
  history: ChatMessage[],
  options: { temperature?: number; maxTokens?: number } = {}
): AsyncGenerator<string, void, void> {
  const ctx = await pool.withModel(LLM_HANDLE, async (loaded) => {
    return completion({
      modelId: loaded.modelId,
      history,
      temperature: options.temperature ?? 0.2,
      maxTokens: options.maxTokens ?? 512,
    });
  });
  for await (const tok of ctx.tokenStream) {
    yield tok;
  }
}
