import { describe, expect, it } from "vitest";
import { buildFolderSummaryContext, FOLDER_SUMMARY_SYSTEM_PROMPT } from "../src/llm.js";

const estTokens = (s: string) => Math.ceil(s.length / 3.5);

describe("buildFolderSummaryContext", () => {
  it("lists each item's summary as a bullet, all included when under budget", () => {
    const r = buildFolderSummaryContext([
      { summary: "Acme MSA — indemnification and liability terms." },
      { summary: "Q3 planning notes — migration timeline." },
    ]);
    expect(r.context).toContain("- Acme MSA — indemnification and liability terms.");
    expect(r.context).toContain("- Q3 planning notes — migration timeline.");
    expect(r.included).toBe(2);
    expect(r.total).toBe(2);
  });

  it("truncates to budget and notes (showing N of M files)", () => {
    const items = Array.from({ length: 200 }, (_, i) => ({
      summary: `Document ${i} about a substantial project topic with detail.`,
    }));
    const r = buildFolderSummaryContext(items, { budgetTokens: 300, charsPerToken: 3.5 });
    expect(r.included).toBeLessThan(200);
    expect(r.total).toBe(200);
    expect(r.context).toContain(`(showing ${r.included} of 200 files)`);
    expect(estTokens(r.context)).toBeLessThanOrEqual(300);
  });

  it("falls back to a body slice when summary is empty, skips fully-empty docs", () => {
    const r = buildFolderSummaryContext([
      { summary: "", body: "Full body text used because the summary was empty." },
      { summary: "", body: "" },
      { summary: "Has a summary." },
    ]);
    expect(r.context).toContain("Full body text used because the summary was empty.");
    expect(r.context).toContain("- Has a summary.");
    expect(r.included).toBe(2); // the fully-empty doc is skipped
  });

  it("handles an empty list", () => {
    const r = buildFolderSummaryContext([]);
    expect(r.included).toBe(0);
    expect(r.total).toBe(0);
  });

  it("exports a system prompt that forbids code", () => {
    expect(FOLDER_SUMMARY_SYSTEM_PROMPT).toMatch(/do not write code/i);
  });
});
