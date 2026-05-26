interface BeeLike {
  put(key: string, value: unknown): Promise<void>;
  createReadStream(opts: {
    gte?: string;
    lt?: string;
  }): AsyncIterable<{ key: string; value: unknown }>;
}

/**
 * Encode an arbitrary string for use as a single segment in a slash-separated
 * Hyperbee key. We must escape `/` (which would fragment the namespace) and
 * `~` (the sentinel we use as the upper bound in prefix range scans).
 * encodeURIComponent handles both, plus other URL-unsafe chars.
 */
function encodeSegment(s: string): string {
  return encodeURIComponent(s);
}

export class Indexes {
  private readonly bee: BeeLike;

  constructor(bee: unknown) {
    this.bee = bee as BeeLike;
  }

  async indexTags(memoryId: string, tags: readonly string[]): Promise<void> {
    for (const tag of tags) {
      await this.bee.put(
        `idx/tag/${encodeSegment(tag)}/${memoryId}`,
        { memoryId }
      );
    }
  }

  async indexPersons(memoryId: string, personIds: readonly string[]): Promise<void> {
    for (const pid of personIds) {
      await this.bee.put(
        `idx/person/${encodeSegment(pid)}/${memoryId}`,
        { memoryId }
      );
    }
  }

  async memoryIdsForTag(tag: string): Promise<string[]> {
    return this.listMemoryIdsWithPrefix(`idx/tag/${encodeSegment(tag)}/`);
  }

  async memoryIdsForPerson(personId: string): Promise<string[]> {
    return this.listMemoryIdsWithPrefix(`idx/person/${encodeSegment(personId)}/`);
  }

  private async listMemoryIdsWithPrefix(prefix: string): Promise<string[]> {
    const ids: string[] = [];
    for await (const node of this.bee.createReadStream({
      gte: prefix,
      lt: prefix + "~",
    })) {
      const value = node.value as { memoryId: string };
      ids.push(value.memoryId);
    }
    return ids;
  }
}
