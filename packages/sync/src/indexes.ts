interface View {
  get(key: string): Promise<{ value: unknown } | null>;
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

export interface IndexesDeps {
  view: View;
  append: (op: unknown) => Promise<void>;
}

export class Indexes {
  private readonly view: View;
  private readonly append: (op: unknown) => Promise<void>;

  constructor(deps: IndexesDeps) {
    this.view = deps.view;
    this.append = deps.append;
  }

  async indexTags(memoryId: string, tags: readonly string[]): Promise<void> {
    for (const tag of tags) {
      await this.append({
        kind: "index",
        key: `idx/tag/${encodeSegment(tag)}/${memoryId}`,
        value: { memoryId },
      });
    }
  }

  async indexPersons(memoryId: string, personIds: readonly string[]): Promise<void> {
    for (const pid of personIds) {
      await this.append({
        kind: "index",
        key: `idx/person/${encodeSegment(pid)}/${memoryId}`,
        value: { memoryId },
      });
    }
  }

  async memoryIdsForTag(tag: string): Promise<string[]> {
    return this.listIds(`idx/tag/${encodeSegment(tag)}/`);
  }

  async memoryIdsForPerson(personId: string): Promise<string[]> {
    return this.listIds(`idx/person/${encodeSegment(personId)}/`);
  }

  async indexRelationship(
    relId: string,
    fromId: string,
    toId: string,
    type: string
  ): Promise<void> {
    await this.append({
      kind: "index",
      key: `idx/rel/from/${encodeSegment(fromId)}/${encodeSegment(relId)}`,
      value: { toId, type },
    });
    await this.append({
      kind: "index",
      key: `idx/rel/to/${encodeSegment(toId)}/${encodeSegment(relId)}`,
      value: { fromId, type },
    });
  }

  async relationshipsFrom(
    fromId: string
  ): Promise<{ relId: string; toId: string; type: string }[]> {
    const prefix = `idx/rel/from/${encodeSegment(fromId)}/`;
    const out: { relId: string; toId: string; type: string }[] = [];
    for await (const node of this.view.createReadStream({
      gte: prefix,
      lt: prefix + "~",
    })) {
      const relId = decodeURIComponent(node.key.slice(prefix.length));
      const v = node.value as { toId: string; type: string };
      out.push({ relId, toId: v.toId, type: v.type });
    }
    return out;
  }

  async relationshipsTo(
    toId: string
  ): Promise<{ relId: string; fromId: string; type: string }[]> {
    const prefix = `idx/rel/to/${encodeSegment(toId)}/`;
    const out: { relId: string; fromId: string; type: string }[] = [];
    for await (const node of this.view.createReadStream({
      gte: prefix,
      lt: prefix + "~",
    })) {
      const relId = decodeURIComponent(node.key.slice(prefix.length));
      const v = node.value as { fromId: string; type: string };
      out.push({ relId, fromId: v.fromId, type: v.type });
    }
    return out;
  }

  async indexMeta(
    memoryId: string,
    meta: {
      tags: readonly string[];
      ownerPeerId: string;
      createdAt: string;
      personIds: readonly string[];
    }
  ): Promise<void> {
    await this.append({
      kind: "meta",
      key: `meta/${memoryId}`,
      value: {
        tags: meta.tags.join(","),
        ownerPeerId: meta.ownerPeerId,
        createdAt: meta.createdAt,
        personIds: meta.personIds.join(","),
      },
    });
  }

  async metaForMemories(
    memoryIds: readonly string[]
  ): Promise<Map<string, Record<string, string>>> {
    const out = new Map<string, Record<string, string>>();
    for (const id of memoryIds) {
      const node = await this.view.get(`meta/${id}`);
      if (node) out.set(id, node.value as Record<string, string>);
    }
    return out;
  }

  async indexFolderMembership(folderId: string, memoryId: string): Promise<void> {
    await this.append({
      kind: "index",
      key: `idx/folder/${encodeSegment(folderId)}/${memoryId}`,
      value: { memoryId },
    });
  }

  async memoryIdsForFolder(folderId: string): Promise<string[]> {
    return this.listIds(`idx/folder/${encodeSegment(folderId)}/`);
  }

  private async listIds(prefix: string): Promise<string[]> {
    const out: string[] = [];
    for await (const node of this.view.createReadStream({
      gte: prefix,
      lt: prefix + "~",
    })) {
      const v = node.value as { memoryId: string };
      out.push(v.memoryId);
    }
    return out;
  }
}
