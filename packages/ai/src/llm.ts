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

export const FOLDER_SUMMARY_SYSTEM_PROMPT =
  "You are given short summaries of the files in a folder. Write a concise overview of what this folder contains and the main themes across the files. Ground your answer ONLY in the provided summaries. Do NOT write code.";

export interface FolderSummaryItem {
  summary: string;
  body?: string;
}

export interface FolderSummaryContextOpts {
  budgetTokens?: number;
  charsPerToken?: number;
}

export interface FolderSummaryContext {
  context: string;
  included: number;
  total: number;
}

/**
 * Build a budgeted bulleted list of per-file summaries for a folder overview.
 * Uses each item's `summary`; falls back to a 200-char slice of `body` when
 * the summary is empty; skips items with neither. Trims to the token budget
 * (so the summary prompt can't overflow the model context) and notes
 * "(showing N of M files)" when truncated.
 */
export function buildFolderSummaryContext(
  items: readonly FolderSummaryItem[],
  opts: FolderSummaryContextOpts = {}
): FolderSummaryContext {
  const budgetTokens = opts.budgetTokens ?? 3000;
  const charsPerToken = opts.charsPerToken ?? 3.5;
  const estTokens = (s: string) => Math.ceil(s.length / charsPerToken);

  const total = items.length;
  // Reserve room for the system prompt + a possible "(showing N of M)" line.
  let remaining = budgetTokens - SYSTEM_PROMPT_TOKENS - 20;
  const lines: string[] = [];
  let included = 0;
  for (const it of items) {
    const text = (it.summary && it.summary.trim())
      ? it.summary.trim()
      : (it.body ? it.body.slice(0, 200).trim() : "");
    if (!text) continue; // skip docs with neither summary nor body
    const line = `- ${text}\n`;
    const cost = estTokens(line);
    if (cost > remaining) break;
    lines.push(line);
    remaining -= cost;
    included += 1;
  }
  const note = included < total ? `\n(showing ${included} of ${total} files)` : "";
  return { context: lines.join("") + note, included, total };
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
