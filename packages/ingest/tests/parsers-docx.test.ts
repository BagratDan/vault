import { describe, expect, it } from "vitest";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { parseDocx } from "../src/parsers/docx.js";

async function tinyDocx(text: string): Promise<Uint8Array> {
  const doc = new Document({
    sections: [
      {
        children: [new Paragraph({ children: [new TextRun(text)] })],
      },
    ],
  });
  const buf = await Packer.toBuffer(doc);
  return new Uint8Array(buf);
}

describe("parseDocx", () => {
  it("extracts text from a programmatically-generated DOCX", async () => {
    const buf = await tinyDocx("indemnification clause from Acme MSA 2025");
    const out = await parseDocx(buf);
    expect(out).toContain("indemnification");
    expect(out).toContain("Acme");
  });
});
