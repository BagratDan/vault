export interface ChunkOpts {
  /** Max characters per chunk. Default 2800 (~700 tokens — safe margin
   *  below EmbeddingGemma's 1024-token batch limit). */
  maxChars?: number;
  /** Characters of overlap between adjacent chunks. Default 300. */
  overlap?: number;
}

/**
 * Split a document body into overlapping windows for embedding. A body
 * within maxChars yields exactly one chunk. Empty / whitespace-only yields
 * []. Prefers to break on whitespace near the window end so chunks don't cut
 * mid-word; a window with no whitespace hard-breaks at maxChars. Guarantees
 * forward progress even when overlap >= maxChars.
 */
export function chunkText(body: string, opts: ChunkOpts = {}): string[] {
  const maxChars = opts.maxChars ?? 2800;
  const overlap = opts.overlap ?? 300;
  if (!body.trim()) return [];
  if (body.length <= maxChars) return [body];

  const chunks: string[] = [];
  let start = 0;
  while (start < body.length) {
    let end = Math.min(start + maxChars, body.length);
    if (end < body.length) {
      // Look backward from `end` for the last whitespace within the final
      // ~maxChars/7 of the window; break there to avoid mid-word cuts.
      const lookback = Math.max(start + 1, end - Math.floor(maxChars / 7));
      const slice = body.slice(lookback, end);
      const ws = slice.lastIndexOf(" ");
      const nl = slice.lastIndexOf("\n");
      const rel = Math.max(ws, nl);
      if (rel !== -1) end = lookback + rel + 1;
    }
    chunks.push(body.slice(start, end));
    if (end >= body.length) break;
    // Advance with overlap, but always make forward progress.
    const next = end - overlap;
    start = next > start ? next : start + 1;
  }
  return chunks;
}
