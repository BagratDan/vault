export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export interface DupCandidate {
  memoryId: string;
  vector: readonly number[];
}

export function findDuplicate(
  query: readonly number[],
  candidates: readonly DupCandidate[],
  threshold = 0.92
): { memoryId: string; score: number } | null {
  let best: { memoryId: string; score: number } | null = null;
  for (const c of candidates) {
    const score = cosine(query, c.vector);
    if (score >= threshold && (!best || score > best.score)) {
      best = { memoryId: c.memoryId, score };
    }
  }
  return best;
}
