import { describe, expect, it } from "vitest";
import { parseText } from "../src/parsers/text.js";

describe("parseText", () => {
  it("decodes UTF-8", async () => {
    const buf = new TextEncoder().encode("hello world");
    expect(await parseText(buf)).toBe("hello world");
  });

  it("preserves Markdown formatting", async () => {
    const md = "# heading\n\n- bullet";
    expect(await parseText(new TextEncoder().encode(md))).toBe(md);
  });

  it("handles empty input", async () => {
    expect(await parseText(new Uint8Array(0))).toBe("");
  });
});
