import os from "node:os";
import { loadModel, unloadModel } from "@qvac/sdk";
import { ModelLoadError } from "./errors.js";

export type ModelSize = "small" | "large";

export interface ModelHandle {
  readonly id: string;
  readonly size: ModelSize;
  /** Opaque value passed straight to loadModel. Defaults to the handle itself. */
  readonly src?: unknown;
  readonly type?: string;
}

export interface LoadedModel {
  readonly modelId: string;
}

interface ResidentEntry {
  handle: ModelHandle;
  loaded: LoadedModel;
  lastUsedAt: number;
}

export interface ModelPoolOptions {
  /** rss/totalmem threshold above which we trigger onMemoryPressure. Default 0.6. */
  memoryPressureFloor?: number;
  /** Called when memory pressure exceeds the floor. */
  onMemoryPressure?: (info: { rss: number; total: number; ratio: number }) => void;
}

export class ModelPool {
  private resident = new Map<string, ResidentEntry>();
  private readonly opts: {
    memoryPressureFloor: number;
    onMemoryPressure?: ModelPoolOptions["onMemoryPressure"];
  };

  constructor(opts: ModelPoolOptions = {}) {
    this.opts = {
      memoryPressureFloor: opts.memoryPressureFloor ?? 0.6,
      ...(opts.onMemoryPressure ? { onMemoryPressure: opts.onMemoryPressure } : {}),
    };
  }

  async withModel<T>(
    handle: ModelHandle,
    fn: (m: LoadedModel) => Promise<T>
  ): Promise<T> {
    const loaded = await this.ensure(handle);
    this.markUsed(handle.id);
    return fn(loaded);
  }

  private async ensure(handle: ModelHandle): Promise<LoadedModel> {
    const existing = this.resident.get(handle.id);
    if (existing) return existing.loaded;

    if (handle.size === "large") {
      await this.evictLargeResidents();
    }

    let loaded: LoadedModel;
    try {
      const result = await loadModel({
        modelSrc: handle.src ?? handle,
        modelType: handle.type ?? "auto",
      });
      loaded = { modelId: result.modelId };
    } catch (cause) {
      throw new ModelLoadError(handle.id, cause);
    }
    this.resident.set(handle.id, {
      handle,
      loaded,
      lastUsedAt: Date.now(),
    });
    this.checkMemoryPressure();
    return loaded;
  }

  private async evictLargeResidents(): Promise<void> {
    const toEvict: string[] = [];
    for (const [id, entry] of this.resident) {
      if (entry.handle.size === "large") toEvict.push(id);
    }
    for (const id of toEvict) {
      const entry = this.resident.get(id);
      if (!entry) continue;
      try {
        await unloadModel({ modelId: entry.loaded.modelId });
      } catch {
        // best effort
      }
      this.resident.delete(id);
    }
  }

  private markUsed(id: string): void {
    const e = this.resident.get(id);
    if (e) e.lastUsedAt = Date.now();
  }

  private checkMemoryPressure(): void {
    const total = os.totalmem();
    const rss = process.memoryUsage().rss;
    const ratio = rss / total;
    if (ratio >= this.opts.memoryPressureFloor) {
      this.opts.onMemoryPressure?.({ rss, total, ratio });
    }
  }

  async unloadAll(): Promise<void> {
    const ids = [...this.resident.keys()];
    for (const id of ids) {
      const entry = this.resident.get(id);
      if (!entry) continue;
      try {
        await unloadModel({ modelId: entry.loaded.modelId });
      } catch {
        // ignore
      }
      this.resident.delete(id);
    }
  }
}
