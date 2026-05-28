/**
 * Parse plain-text and Markdown files. UTF-8 decoded, returned as-is.
 * Markdown formatting is NOT stripped — the embedding model handles it
 * fine and the LLM extraction step normalizes prose.
 */
export async function parseText(buf: Uint8Array): Promise<string> {
  return new TextDecoder("utf-8").decode(buf);
}
