import {
  memoryShape,
  personShape,
  placeShape,
  eventShape,
  taskShape,
  externalRefShape,
  relationshipShape,
  sourceRecordShape,
  folderPublicShape,
  type Memory,
  type Person,
  type Place,
  type Event,
  type Task,
  type ExternalRef,
  type Relationship,
  type SourceRecord,
  type FolderPublic,
  type FolderVisibility,
  type Ulid,
} from "@vault/domain";
import type { FolderLocal } from "./folder-local.js";

const PREFIX = {
  memory: "mem/",
  person: "person/",
  place: "place/",
  event: "event/",
  task: "task/",
  externalRef: "ref/",
  relationship: "rel/",
  source: "src/",
  folder: "folder/",
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
  folderLocal?: FolderLocal | null;
}

export class Repo {
  private readonly view: View;
  private readonly append: (op: unknown) => Promise<void>;
  private readonly ownerPeerId: string;
  private readonly folderLocal: FolderLocal | null;

  constructor(deps: RepoDeps) {
    this.view = deps.view;
    this.append = deps.append;
    this.ownerPeerId = deps.ownerPeerId;
    this.folderLocal = deps.folderLocal ?? null;
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

  /**
   * Write a memory to the correct storage tier based on its folder's
   * visibility. PRIVATE folder memories go to the owner-local Hyperbee
   * (FolderLocal) and NEVER reach Autobee. PUBLIC folder memories go
   * through the normal autobee append. This is the storage-tier half of
   * the two-gate privacy model (the other gate is the search-probe filter).
   */
  async putMemoryByVisibility(m: Memory, visibility: FolderVisibility): Promise<void> {
    if (visibility === "private") {
      if (!this.folderLocal) {
        throw new Error("putMemoryByVisibility: private folder requires FolderLocal");
      }
      await this.folderLocal.putPrivateMemory(m);
      return;
    }
    await this.putMemory(m); // existing autobee path
  }

  /** Union the owner's public (autobee) + private (FolderLocal) memories for a folder. */
  async listMemoriesInFolder(folderId: string): Promise<Memory[]> {
    const all = await this.listMemories();
    const publicHits = all.filter((m) => m.folderId === folderId);
    let privateHits: Memory[] = [];
    if (this.folderLocal) {
      privateHits = await this.folderLocal.listPrivateMemoriesByFolder(folderId);
    }
    return [...publicHits, ...privateHits];
  }

  /** Soft-delete a PUBLIC (autobee) memory by stamping deletedAt. */
  async markMemoryDeleted(memoryId: string): Promise<void> {
    const m = await this.getMemory(memoryId as Ulid);
    if (!m) return;
    const updated = {
      ...m,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.append({
      kind: "memory",
      key: `${PREFIX.memory}${m.id}`,
      value: updated,
    });
  }

  // Folder (PUBLIC subset, synced) ----------------------------------------
  async putFolderPublic(folderPublic: FolderPublic): Promise<void> {
    folderPublicShape.parse(folderPublic);
    await this.append({
      kind: "folder",
      key: `${PREFIX.folder}${folderPublic.id}`,
      value: folderPublic,
    });
  }

  async listFoldersPublic(): Promise<FolderPublic[]> {
    return this.listPrefix(PREFIX.folder, (raw) => folderPublicShape.parse(raw));
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
