import { complete } from "./llm.js";
import type { ModelPool } from "./model-pool.js";

export type AskIntent = "summary" | "search";

/** Phrases that unambiguously request a whole-folder overview. Matched before
 *  any LLM call so explicit summary requests are instant + deterministic. */
export const SUMMARY_KEYWORDS =
  /\b(summari[sz]e|summary|overview|tl;?dr|rundown|recap)\b|what'?s in (here|this|the folder)|what are these (files|documents)|what does this folder (contain|have)/i;

/**
 * Decide whether a folder-scoped Ask query wants a whole-folder SUMMARY or a
 * normal semantic SEARCH. Keyword guardrail first (no LLM); otherwise one
 * constrained single-token LLM call. Any malformed output, or an LLM error,
 * safely defaults to "search" — so this can never make Ask worse than the
 * existing search path.
 */
export async function classifyAskIntent(
  pool: ModelPool,
  query: string
): Promise<AskIntent> {
  if (SUMMARY_KEYWORDS.test(query)) return "summary";
  let raw: string;
  try {
    raw = await complete(pool, [
      {
        role: "system",
        content:
          "Classify the user's request about a folder of documents. Reply with EXACTLY one word: SUMMARY if they want an overview of the whole folder, or SEARCH if they want specific information. Output only the single word.",
      },
      { role: "user", content: query },
    ]);
  } catch {
    return "search";
  }
  const token = raw.trim().toUpperCase().split(/\s+/)[0] ?? "";
  if (token === "SUMMARY") return "summary";
  if (token === "SEARCH") return "search";
  // Junk output → re-check keywords, then default to search.
  return SUMMARY_KEYWORDS.test(query) ? "summary" : "search";
}
