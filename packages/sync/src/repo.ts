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

// Minimal Hyperbee interface we depend on. Avoids pulling in the
// untyped Hyperbee module's surface.
interface BeeLike {
  put(key: string, value: unknown): Promise<void>;
  get(key: string): Promise<{ value: unknown } | null>;
  createReadStream(opts: {
    gte?: string;
    lt?: string;
  }): AsyncIterable<{ key: string; value: unknown }>;
}

export class Repo {
  private readonly bee: BeeLike;

  constructor(bee: unknown) {
    this.bee = bee as BeeLike;
  }

  // Memory ----------------------------------------------------------------
  async putMemory(m: Memory): Promise<void> {
    memoryShape.parse(m);
    await this.bee.put(`${PREFIX.memory}${m.id}`, m);
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
    await this.bee.put(`${PREFIX.person}${p.id}`, p);
  }
  async listPersons(): Promise<Person[]> {
    return this.listPrefix(PREFIX.person, (raw) => personShape.parse(raw));
  }

  // Place -----------------------------------------------------------------
  async putPlace(p: Place): Promise<void> {
    placeShape.parse(p);
    await this.bee.put(`${PREFIX.place}${p.id}`, p);
  }
  async listPlaces(): Promise<Place[]> {
    return this.listPrefix(PREFIX.place, (raw) => placeShape.parse(raw));
  }

  // Event -----------------------------------------------------------------
  async putEvent(e: Event): Promise<void> {
    eventShape.parse(e);
    await this.bee.put(`${PREFIX.event}${e.id}`, e);
  }
  async listEvents(): Promise<Event[]> {
    return this.listPrefix(PREFIX.event, (raw) => eventShape.parse(raw));
  }

  // Task ------------------------------------------------------------------
  async putTask(t: Task): Promise<void> {
    taskShape.parse(t);
    await this.bee.put(`${PREFIX.task}${t.id}`, t);
  }
  async listTasks(): Promise<Task[]> {
    return this.listPrefix(PREFIX.task, (raw) => taskShape.parse(raw));
  }

  // ExternalRef -----------------------------------------------------------
  async putExternalRef(r: ExternalRef): Promise<void> {
    externalRefShape.parse(r);
    await this.bee.put(`${PREFIX.externalRef}${r.id}`, r);
  }

  // Relationship ----------------------------------------------------------
  async putRelationship(r: Relationship): Promise<void> {
    relationshipShape.parse(r);
    await this.bee.put(`${PREFIX.relationship}${r.id}`, r);
  }

  // SourceRecord ----------------------------------------------------------
  async putSourceRecord(s: SourceRecord): Promise<void> {
    sourceRecordShape.parse(s);
    await this.bee.put(`${PREFIX.source}${s.id}`, s);
  }
  async getSourceRecord(id: Ulid): Promise<SourceRecord | null> {
    return this.getOne(`${PREFIX.source}${id}`, (raw) => sourceRecordShape.parse(raw));
  }

  // -----------------------------------------------------------------------
  private async getOne<T>(key: string, parse: (raw: unknown) => T): Promise<T | null> {
    const node = await this.bee.get(key);
    if (!node) return null;
    return parse(node.value);
  }

  private async listPrefix<T>(prefix: string, parse: (raw: unknown) => T): Promise<T[]> {
    const results: T[] = [];
    for await (const node of this.bee.createReadStream({
      gte: prefix,
      lt: prefix + "~",
    })) {
      results.push(parse(node.value));
    }
    return results;
  }
}
