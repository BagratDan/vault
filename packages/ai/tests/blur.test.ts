import { describe, expect, it } from "vitest";
import { blurPreview } from "../src/blur.js";

describe("blurPreview", () => {
  it("keeps the first word and bullets every other alphanumeric char", () => {
    expect(blurPreview("indemnification clause from Acme MSA 2025"))
      .toBe("indemnification •••••• •••• •••• ••• ••••");
  });

  it("preserves whitespace and most punctuation", () => {
    expect(blurPreview("hello, world! it's me.")).toBe("hello, •••••! ••'• ••.");
  });

  it("trims to ~80 chars, breaking on the last whitespace if possible", () => {
    const long =
      "indemnification clause from Acme MSA 2025 covering all subsidiaries and affiliates of either party in perpetuity";
    const out = blurPreview(long);
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out.startsWith("indemnification")).toBe(true);
  });

  it("handles empty / single-word inputs", () => {
    expect(blurPreview("")).toBe("");
    expect(blurPreview("hello")).toBe("hello");
  });

  it("never returns alphanumeric chars after the first word", () => {
    const out = blurPreview("Sarah promised the migration by Friday");
    const afterFirst = out.slice(out.indexOf(" ") + 1);
    expect(/[A-Za-z0-9]/.test(afterFirst)).toBe(false);
  });
});
