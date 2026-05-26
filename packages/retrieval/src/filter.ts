export interface SearchFilters {
  tags?: readonly string[];
  ownerPeerId?: string;
  createdAfter?: string;
  createdBefore?: string;
  personId?: string;
}

export interface RawHit {
  memoryId: string;
  score: number;
  snippet: string;
  metadata: Readonly<Record<string, string>>;
}

export function matchesFilters(hit: RawHit, filters?: SearchFilters): boolean {
  if (!filters) return true;
  if (filters.tags && filters.tags.length > 0) {
    const tags = (hit.metadata["tags"] ?? "").split(",").map((t) => t.trim());
    const ok = filters.tags.every((t) => tags.includes(t));
    if (!ok) return false;
  }
  if (filters.ownerPeerId && hit.metadata["ownerPeerId"] !== filters.ownerPeerId) {
    return false;
  }
  if (filters.personId) {
    const persons = (hit.metadata["personIds"] ?? "").split(",");
    if (!persons.includes(filters.personId)) return false;
  }
  const createdAt = hit.metadata["createdAt"];
  if (filters.createdAfter && createdAt && createdAt < filters.createdAfter) {
    return false;
  }
  if (filters.createdBefore && createdAt && createdAt > filters.createdBefore) {
    return false;
  }
  return true;
}
