// @ts-expect-error — corestore has no published types
import Corestore from "corestore";
// @ts-expect-error — hyperbee has no published types
import Hyperbee from "hyperbee";
import {
  folderShape,
  memoryShape,
  type Folder,
  type Memory,
} from "@vault/domain";

/**
 * Owner-local Hyperbee. Stores:
 *  - Full folder records (key: `folder/<id>`) with `path` field intact
 *  - Private-folder memories (key: `memory/<id>`) that MUST NOT replicate
 *
 * Pattern mirrors AuditLog (Plan 3) — per-peer, never enters Autobee.
 * Construction follows store-legacy.ts: standalone Corestore + Hyperbee
 * over a named core, utf-8 keys + json values.
 */
export class FolderLocal {
  private store: {
    ready(): Promise<void>;
    close(): Promise<void>;
    get(opts: { name: string }): {
      ready(): Promise<void>;
    };
  };
  private bee!: {
    ready(): Promise<void>;
    close(): Promise<void>;
    put(key: string, value: unknown): Promise<void>;
    get(key: string): Promise<{ value: unknown } | null>;
    createReadStream(opts: {
      gte?: string;
      lt?: string;
    }): AsyncIterable<{ key: string; value: unknown }>;
  };

  constructor(rootDir: string) {
    this.store = new Corestore(rootDir);
  }

  async ready(): Promise<void> {
    await this.store.ready();
    const core = this.store.get({ name: "folder-local" });
    await core.ready();
    this.bee = new Hyperbee(core, {
      keyEncoding: "utf-8",
      valueEncoding: "json",
    });
    await this.bee.ready();
  }

  async putFolder(f: Folder): Promise<void> {
    folderShape.parse(f);
    await this.bee.put(`folder/${f.id}`, f);
  }

  async getFolder(id: string): Promise<Folder | null> {
    const r = await this.bee.get(`folder/${id}`);
    return r ? (r.value as Folder) : null;
  }

  async listFolders(): Promise<Folder[]> {
    const out: Folder[] = [];
    for await (const { value } of this.bee.createReadStream({
      gte: "folder/",
      lt: "folder/~",
    })) {
      out.push(value as Folder);
    }
    return out;
  }

  async putPrivateMemory(m: Memory): Promise<void> {
    memoryShape.parse(m);
    await this.bee.put(`memory/${m.id}`, m);
  }

  async markPrivateMemoryDeleted(id: string): Promise<void> {
    const r = await this.bee.get(`memory/${id}`);
    if (!r) return;
    const m = r.value as Memory;
    const now = new Date().toISOString();
    await this.bee.put(`memory/${id}`, {
      ...m,
      deletedAt: now,
      updatedAt: now,
    });
  }

  async getPrivateMemory(id: string): Promise<Memory | null> {
    const r = await this.bee.get(`memory/${id}`);
    return r ? (r.value as Memory) : null;
  }

  async listAllPrivateMemories(): Promise<Memory[]> {
    const out: Memory[] = [];
    for await (const { value } of this.bee.createReadStream({
      gte: "memory/",
      lt: "memory/~",
    })) {
      out.push(value as Memory);
    }
    return out;
  }

  async listPrivateMemoriesByFolder(folderId: string): Promise<Memory[]> {
    const out: Memory[] = [];
    for await (const { value } of this.bee.createReadStream({
      gte: "memory/",
      lt: "memory/~",
    })) {
      const m = value as Memory;
      if (m.folderId === folderId) out.push(m);
    }
    return out;
  }

  async close(): Promise<void> {
    await this.bee.close();
    await this.store.close();
  }
}
