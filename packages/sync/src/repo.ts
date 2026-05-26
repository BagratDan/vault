import {
  memoryShape,
  personShape,
  placeShape,
  eventShape,
  taskShape,
  externalRefShape,
  relationshipShape,
  sourceRecordShape,
  type Memory,
  type Person,
  type Place,
  type Event,
  type Task,
  type ExternalRef,
  type Relationship,
  type SourceRecord,
  type Ulid,
} from "@vault/domain";

const PREFIX = {
  memory: "mem/",
  person: "person/",
  place: "place/",
  event: "event/",
  task: "task/",
  externalRef: "ref/",
  relationship: "rel/",
  source: "src/",
} as const;

interface View {
  get(key: string): Promise<{ value: unknown } | null>;
  createReadStream(opts: {
    gte?: string;
    lt?: string;
  }): AsyncIterable<{ key: string; value: unknown }>;
}

export interface RepoDeps {
  view: View;
  append: (op: unknown) => Promise<void>;
  ownerPeerId: string;
}

export class Repo {
  private readonly view: View;
  private readonly append: (op: unknown) => Promise<void>;
  private readonly ownerPeerId: string;

  constructor(deps: RepoDeps) {
    this.view = deps.view;
    this.append = deps.append;
    this.ownerPeerId = deps.ownerPeerId;
  }

  // Memory ----------------------------------------------------------------
  async putMemory(m: Memory): Promise<void> {
    memoryShape.parse(m);
    await this.append({ kind: "memory", key: `${PREFIX.memory}${m.id}`, value: m });
  }
  async getMemory(id: Ulid): Promise<Memory | null> {
    return this.getOne(`${PREFIX.memory}${id}`, (raw) => memoryShape.parse(raw));
  }
  async listMemories(): Promise<Memory[]> {
    return this.listPrefix(PREFIX.memory, (raw) => memoryShape.parse(raw));
  }

  // Person ----------------------------------------------------------------
  async putPerson(p: Person): Promise<void> {
    personShape.parse(p);
    await this.append({ kind: "person", key: `${PREFIX.person}${p.id}`, value: p });
  }
  async listPersons(): Promise<Person[]> {
    return this.listPrefix(PREFIX.person, (raw) => personShape.parse(raw));
  }

  // Place -----------------------------------------------------------------
  async putPlace(p: Place): Promise<void> {
    placeShape.parse(p);
    await this.append({ kind: "place", key: `${PREFIX.place}${p.id}`, value: p });
  }
  async listPlaces(): Promise<Place[]> {
    return this.listPrefix(PREFIX.place, (raw) => placeShape.parse(raw));
  }

  // Event -----------------------------------------------------------------
  async putEvent(e: Event): Promise<void> {
    eventShape.parse(e);
    await this.append({ kind: "event", key: `${PREFIX.event}${e.id}`, value: e });
  }
  async listEvents(): Promise<Event[]> {
    return this.listPrefix(PREFIX.event, (raw) => eventShape.parse(raw));
  }

  // Task ------------------------------------------------------------------
  async putTask(t: Task): Promise<void> {
    taskShape.parse(t);
    await this.append({ kind: "task", key: `${PREFIX.task}${t.id}`, value: t });
  }
  async listTasks(): Promise<Task[]> {
    return this.listPrefix(PREFIX.task, (raw) => taskShape.parse(raw));
  }

  // ExternalRef -----------------------------------------------------------
  async putExternalRef(r: ExternalRef): Promise<void> {
    externalRefShape.parse(r);
    await this.append({ kind: "external-ref", key: `${PREFIX.externalRef}${r.id}`, value: r });
  }

  // Relationship ----------------------------------------------------------
  async putRelationship(r: Relationship): Promise<void> {
    relationshipShape.parse(r);
    await this.append({ kind: "relationship", key: `${PREFIX.relationship}${r.id}`, value: r });
  }

  // SourceRecord ----------------------------------------------------------
  async putSourceRecord(s: SourceRecord): Promise<void> {
    sourceRecordShape.parse(s);
    await this.append({ kind: "source-record", key: `${PREFIX.source}${s.id}`, value: s });
  }
  async getSourceRecord(id: Ulid): Promise<SourceRecord | null> {
    return this.getOne(`${PREFIX.source}${id}`, (raw) => sourceRecordShape.parse(raw));
  }

  // -----------------------------------------------------------------------
  private async getOne<T>(key: string, parse: (raw: unknown) => T): Promise<T | null> {
    const node = await this.view.get(key);
    if (!node) return null;
    return parse(node.value);
  }

  private async listPrefix<T>(prefix: string, parse: (raw: unknown) => T): Promise<T[]> {
    const results: T[] = [];
    for await (const node of this.view.createReadStream({
      gte: prefix,
      lt: prefix + "~",
    })) {
      results.push(parse(node.value));
    }
    return results;
  }
}
