import { completion } from "@qvac/sdk";
import { VAULT_MODELS } from "./models.js";
import { ModelPool, type ModelHandle } from "./model-pool.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const LLM_HANDLE: ModelHandle = {
  id: "qwen3-4b-inst-q4_k_m",
  size: "large" as const,
  src: VAULT_MODELS.llm,
  // QVAC defaults ctx_size to 1024, which overflows on multi-snippet Ask
  // prompts. 4096 holds a budgeted prompt (~3000 tok) plus the answer.
  modelConfig: { ctx_size: 4096 },
};

export interface AnswerContextInput {
  question: string;
  /** Retrieved snippets, highest-score first. */
  snippets: readonly string[];
  /** Optional folder metadata line, e.g. "Sample has 80 files". */
  folderStats?: string;
}

export interface AnswerContextOpts {
  /** Token budget for the whole user message. Default 3000 (of a 4096 window;
   *  ~1000 reserved for the generated answer). */
  budgetTokens?: number;
  /** Chars-per-token estimate. Default 3.5 (conservative — safe on dense text). */
  charsPerToken?: number;
}

/** Tokens reserved for the (short, constant) system prompt so the estimate
 *  accounts for it without threading the system string through. */
const SYSTEM_PROMPT_TOKENS = 64;

/**
 * Assemble the Ask user-message context — folder stats + numbered snippets +
 * the question — trimmed to a token budget so the prompt can never overflow
 * the model context window. The question and folder stats are always kept;
 * snippets fill the remaining budget highest-first, the last one truncated to
 * fit if needed. Tokens are estimated from characters (no SDK token API).
 */
export function buildAnswerContext(
  input: AnswerContextInput,
  opts: AnswerContextOpts = {}
): string {
  const budgetTokens = opts.budgetTokens ?? 3000;
  const charsPerToken = opts.charsPerToken ?? 3.5;
  const estTokens = (s: string) => Math.ceil(s.length / charsPerToken);

  const statsLine = input.folderStats
    ? `Folder context: ${input.folderStats}\n\n`
    : "";
  const questionLine = `\nQuestion: ${input.question}`;

  // Fixed parts always survive: system allowance + stats + question.
  const fixedTokens =
    SYSTEM_PROMPT_TOKENS + estTokens(statsLine) + estTokens(questionLine);
  let remaining = budgetTokens - fixedTokens;

  const parts: string[] = [];
  let n = 0;
  for (const snippet of input.snippets) {
    n += 1;
    const wrapped = `[${n}] ${snippet}\n`;
    const cost = estTokens(wrapped);
    if (cost <= remaining) {
      parts.push(wrapped);
      remaining -= cost;
    } else if (remaining > 0) {
      // Truncate the head of this snippet to fit the remaining budget.
      const maxChars = Math.max(0, Math.floor(remaining * charsPerToken) - 6); // -6 for "[n] " + "\n"
      if (maxChars > 0) {
        parts.push(`[${n}] ${snippet.slice(0, maxChars)}\n`);
      }
      remaining = 0;
      break;
    } else {
      break;
    }
  }

  const snippetBlock = parts.length > 0 ? `Snippets:\n${parts.join("")}` : "";
  return `${statsLine}${snippetBlock}${questionLine}`.trim();
}

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
