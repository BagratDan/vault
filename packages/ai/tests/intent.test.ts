import { describe, expect, it, vi } from "vitest";

// classifyAskIntent uses complete() from llm.js for the ambiguous case.
const completeMock = vi.fn(async () => "SEARCH");
vi.mock("../src/llm.js", () => ({
  complete: (...args: unknown[]) => completeMock(...args),
}));

import { classifyAskIntent, SUMMARY_KEYWORDS } from "../src/intent.js";

const fakePool = {} as never;

describe("classifyAskIntent", () => {
  it("matches summary keywords WITHOUT calling the LLM", async () => {
    completeMock.mockClear();
    for (const q of [
      "summarize the contents",
      "summarise this folder",
      "give me an overview",
      "what's in here",
      "what are these documents",
      "tl;dr",
      "give me a rundown",
    ]) {
      expect(await classifyAskIntent(fakePool, q)).toBe("summary");
    }
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("SUMMARY_KEYWORDS regex matches the canonical phrases", () => {
    expect(SUMMARY_KEYWORDS.test("please summarize this")).toBe(true);
    expect(SUMMARY_KEYWORDS.test("what does the contract say")).toBe(false);
  });

  it("falls to the LLM for non-keyword queries and honors SUMMARY/SEARCH", async () => {
    completeMock.mockResolvedValueOnce("SUMMARY");
    expect(await classifyAskIntent(fakePool, "tell me about everything here")).toBe("summary");
    completeMock.mockResolvedValueOnce("SEARCH");
    expect(await classifyAskIntent(fakePool, "the liability cap detail")).toBe("search");
  });

  it("defaults to search when the LLM returns junk", async () => {
    completeMock.mockResolvedValueOnce("Here is your answer, friend.");
    expect(await classifyAskIntent(fakePool, "the liability cap detail")).toBe("search");
  });

  it("defaults to search when the LLM throws", async () => {
    completeMock.mockRejectedValueOnce(new Error("model boom"));
    expect(await classifyAskIntent(fakePool, "the liability cap detail")).toBe("search");
  });

  it("parses a one-word answer case-insensitively with surrounding noise", async () => {
    completeMock.mockResolvedValueOnce("  summary\n");
    expect(await classifyAskIntent(fakePool, "anything ambiguous")).toBe("summary");
  });
});
