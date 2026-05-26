interface View {
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
