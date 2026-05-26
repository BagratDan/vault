import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { parsePdf } from "../src/parsers/pdf.js";

async function tinyPdf(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 100]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 20, y: 60, size: 14, font });
  return doc.save();
}

describe("parsePdf", () => {
  it("extracts text from a programmatically-generated PDF", async () => {
    const buf = await tinyPdf("indemnification clause from Acme MSA 2025");
    const out = await parsePdf(buf);
    expect(out).toContain("indemnification");
    expect(out).toContain("Acme");
  });

  it("returns empty string for an empty PDF (no text-layer content)", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const buf = await doc.save();
    expect(await parsePdf(buf)).toBe("");
  });
});
