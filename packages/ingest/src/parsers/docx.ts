import mammoth from "mammoth";

/**
 * Extract plain text from a .docx file. Legacy .doc is NOT supported in v1.
 * Returns the raw text — mammoth strips formatting.
 */
export async function parseDocx(buf: Uint8Array): Promise<string> {
  const buffer = Buffer.from(buf);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}
