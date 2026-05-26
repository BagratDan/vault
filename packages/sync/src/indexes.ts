interface BeeLike {
  put(key: string, value: unknown): Promise<void>;
  createReadStream(opts: {
    gte?: string;
    lt?: string;
  }): AsyncIterable<{ key: string; value: unknown }>;
}

export class Indexes {
  private readonly bee: BeeLike;

  constructor(bee: unknown) {
    this.bee = bee as BeeLike;
  }

  async indexTags(memoryId: string, tags: readonly string[]): Promise<void> {
    for (const tag of tags) {
      await this.bee.put(`idx/tag/${tag}/${memoryId}`, { memoryId });
    }
  }

  async indexPersons(memoryId: string, personIds: readonly string[]): Promise<void> {
    for (const pid of personIds) {
      await this.bee.put(`idx/person/${pid}/${memoryId}`, { memoryId });
    }
  }

  async memoryIdsForTag(tag: string): Promise<string[]> {
    return this.listMemoryIdsWithPrefix(`idx/tag/${tag}/`);
  }

  async memoryIdsForPerson(personId: string): Promise<string[]> {
    return this.listMemoryIdsWithPrefix(`idx/person/${personId}/`);
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
