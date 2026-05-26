import { describe, expect, it } from "vitest";
import { cosine, findDuplicate } from "../src/dedup.js";

describe("cosine", () => {
  it("returns 1.0 for identical vectors", () => {
    expect(cosine([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
  });

  it("returns 0.0 for orthogonal vectors", () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns -1.0 for opposite vectors", () => {
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("throws on length mismatch", () => {
    expect(() => cosine([1, 0], [1, 0, 0])).toThrow(/length/);
  });
});

describe("findDuplicate", () => {
  it("returns the ID of an existing memory with cosine >= 0.92", () => {
    const candidates = [
      { memoryId: "01M0".padEnd(26, "A"), vector: [1, 0, 0] },
      { memoryId: "01M0".padEnd(26, "B"), vector: [0.93, 0.1, 0.1] },
    ];
    const query = [1, 0, 0];
    expect(findDuplicate(query, candidates, 0.92)?.memoryId).toBe(
      "01M0".padEnd(26, "A")
    );
  });

  it("returns null when no candidate exceeds the threshold", () => {
    const candidates = [{ memoryId: "x", vector: [0.5, 0.5, 0.5] }];
    expect(findDuplicate([1, 0, 0], candidates, 0.92)).toBeNull();
  });
});
