import { describe, expect, it } from "vitest";
import { buildAnswerContext } from "../src/llm.js";

// The helper estimates tokens as ceil(chars / 3.5). The default budget is 3000
// tokens, with a fixed 64-token allowance reserved for the system prompt.
const estTokens = (s: string) => Math.ceil(s.length / 3.5);

describe("buildAnswerContext", () => {
  it("always includes the question and folder stats", () => {
    const out = buildAnswerContext({
      question: "how many files are in the folder",
      snippets: [],
      folderStats: "Sample has 80 files",
    });
    expect(out).toContain("how many files are in the folder");
    expect(out).toContain("Sample has 80 files");
  });

  it("returns just the question when there are no snippets and no stats", () => {
    const out = buildAnswerContext({ question: "what is X", snippets: [] });
    expect(out).toContain("what is X");
    expect(out.length).toBeGreaterThan(0);
  });

  it("never exceeds the token budget even with many large snippets", () => {
    const big = "lorem ipsum ".repeat(400); // ~4800 chars each (~1371 tokens)
    const out = buildAnswerContext(
      { question: "summarize", snippets: [big, big, big, big, big] },
      { budgetTokens: 3000, charsPerToken: 3.5 }
    );
    expect(estTokens(out)).toBeLessThanOrEqual(3000);
  });

  it("includes a single oversized snippet truncated, not dropped", () => {
    const huge = "x".repeat(20000); // ~5714 tokens — bigger than the budget
    const out = buildAnswerContext(
      { question: "q", snippets: [huge] },
      { budgetTokens: 1000, charsPerToken: 3.5 }
    );
    // Some of the snippet survives (truncated head), and the budget holds.
    expect(out).toContain("x");
    expect(estTokens(out)).toBeLessThanOrEqual(1000);
  });

  it("includes snippets highest-first and numbers them [1],[2]", () => {
    const out = buildAnswerContext({
      question: "q",
      snippets: ["alpha snippet", "beta snippet"],
    });
    expect(out).toContain("[1] alpha snippet");
    expect(out).toContain("[2] beta snippet");
    expect(out.indexOf("[1]")).toBeLessThan(out.indexOf("[2]"));
  });

  it("drops later snippets when the budget is exhausted by earlier ones", () => {
    // First snippet is truncated to consume ALL remaining budget, so the
    // second can't fit. budget 1000 - fixed(~68) leaves ~932 tok; the 7000-char
    // (~2000-tok) first snippet truncates to fill it, zeroing the remainder.
    const big = "word ".repeat(1400); // ~7000 chars (~2000 tokens)
    const out = buildAnswerContext(
      { question: "q", snippets: [big, "SHOULD_NOT_FIT_TINY_MARKER"] },
      { budgetTokens: 1000, charsPerToken: 3.5 }
    );
    // The first snippet truncates to fill the budget; the second is dropped.
    expect(out).not.toContain("SHOULD_NOT_FIT_TINY_MARKER");
    expect(estTokens(out)).toBeLessThanOrEqual(1000);
  });
});
