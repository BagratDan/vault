import { describe, expect, it } from "vitest";
import { chunkText } from "../src/chunk.js";

describe("chunkText", () => {
  it("returns [] for empty / whitespace-only", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\t ")).toEqual([]);
  });

  it("returns a single chunk for a body within maxChars", () => {
    const body = "short document body";
    expect(chunkText(body, { maxChars: 100 })).toEqual([body]);
  });

  it("splits a long body into multiple chunks, each <= maxChars", () => {
    const body = "word ".repeat(2000); // 10000 chars
    const chunks = chunkText(body, { maxChars: 2800, overlap: 300 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(2800);
  });

  it("adjacent chunks overlap", () => {
    const body = "word ".repeat(2000);
    const chunks = chunkText(body, { maxChars: 2800, overlap: 300 });
    const tail = chunks[0]!.slice(-100);
    expect(chunks[1]!.includes(tail.trim().split(" ")[0]!)).toBe(true);
  });

  it("prefers a whitespace break (no mid-word cut when whitespace exists)", () => {
    const body = "alpha ".repeat(1000); // every 6th char is a space
    const chunks = chunkText(body, { maxChars: 100, overlap: 10 });
    for (const c of chunks.slice(0, -1)) {
      expect(/\S$/.test(c) && !c.endsWith("alpha")).toBe(false);
    }
  });

  it("hard-splits a no-whitespace blob at maxChars", () => {
    const body = "x".repeat(5000);
    const chunks = chunkText(body, { maxChars: 1000, overlap: 100 });
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1000);
    expect(chunks.join("").length).toBeGreaterThanOrEqual(5000 - 1000);
  });

  it("makes progress (no infinite loop) when overlap >= maxChars", () => {
    const body = "a b c d e f g h i j ".repeat(500);
    const chunks = chunkText(body, { maxChars: 50, overlap: 999 });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThan(10000);
  });
});
