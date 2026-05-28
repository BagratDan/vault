/**
 * Extract text-layer content from a PDF buffer. Uses pdfjs-dist's
 * Node-friendly legacy build. Image-only PDFs (scanned, no text layer)
 * return an empty string — caller is responsible for skipping.
 */
export async function parsePdf(buf: Uint8Array): Promise<string> {
  // The legacy build runs in plain Node without browser polyfills.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: buf });
  const doc = await loadingTask.promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: unknown) => {
        if (item && typeof item === "object" && "str" in item) {
          return (item as { str: string }).str;
        }
        return "";
      })
      .join(" ");
    if (text.trim().length > 0) out.push(text);
  }
  await doc.cleanup();
  return out.join("\n\n");
}
