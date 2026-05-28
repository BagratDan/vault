import os from "node:os";
import { loadModel, unloadModel } from "@qvac/sdk";
import { ModelLoadError } from "./errors.js";

export type ModelSize = "small" | "large";

export interface ModelHandle {
  readonly id: string;
  readonly size: ModelSize;
  /**
   * Passed as `modelSrc` to loadModel. Either a single registry-constant
   * descriptor (e.g. LLAMA_3_2_1B_INST_Q4_0) or, for multi-file STT loads,
   * a descriptor object the SDK accepts. Required — defaulting to the
   * handle object itself doesn't work for the real SDK.
   */
  readonly src: unknown;
  /** Optional explicit modelType (e.g. "llamacpp-completion"). The SDK
   *  infers this from `src` when src is a registry constant, so leave
   *  unset for the common case. */
  readonly type?: string;
  /** Optional SDK modelConfig forwarded to loadModel. Used to set the LLM
   *  context window (`{ ctx_size: 4096 }`) — QVAC defaults ctx_size to 1024,
   *  which overflows on multi-snippet Ask prompts. */
  readonly modelConfig?: Record<string, unknown>;
}

interface ResidentEntry {
  handle: ModelHandle;
  modelId: string;
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
  /** In-flight load promises keyed by handle.id. Shared between concurrent
   *  callers so the SDK only sees one loadModel per handle. Removing this
   *  caused MODEL_ALREADY_REGISTERED when two routes asked for the embed
   *  model in parallel before the first load completed. */
  private loading = new Map<string, Promise<string>>();
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

  /**
   * Load `handle` if not resident, then call `fn` with the SDK-assigned
   * modelId string. The id is what every other SDK call (completion,
   * embed, transcribe, textToSpeech, ragSaveEmbeddings, ragSearch) expects.
   */
  async withModel<T>(
    handle: ModelHandle,
    fn: (modelId: string) => Promise<T>
  ): Promise<T> {
    const modelId = await this.ensure(handle);
    this.markUsed(handle.id);
    return fn(modelId);
  }

  /** Ensure the handle is resident; return its SDK modelId. Concurrent
   *  callers for the same handle share a single in-flight load promise. */
  async ensure(handle: ModelHandle): Promise<string> {
    const existing = this.resident.get(handle.id);
    if (existing) return existing.modelId;

    const inFlight = this.loading.get(handle.id);
    if (inFlight) return inFlight;

    const promise = this.doLoad(handle);
    this.loading.set(handle.id, promise);
    try {
      return await promise;
    } finally {
      this.loading.delete(handle.id);
    }
  }

  private async doLoad(handle: ModelHandle): Promise<string> {
    if (handle.size === "large") {
      await this.evictLargeResidents();
    }
    let modelId: string;
    try {
      const opts: {
        modelSrc: unknown;
        modelType?: string;
        modelConfig?: Record<string, unknown>;
      } = { modelSrc: handle.src };
      if (handle.type !== undefined) opts.modelType = handle.type;
      if (handle.modelConfig !== undefined) opts.modelConfig = handle.modelConfig;
      modelId = await loadModel(opts);
    } catch (cause) {
      throw new ModelLoadError(handle.id, cause);
    }
    this.resident.set(handle.id, {
      handle,
      modelId,
      lastUsedAt: Date.now(),
    });
    this.checkMemoryPressure();
    return modelId;
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
        await unloadModel({ modelId: entry.modelId });
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
        await unloadModel({ modelId: entry.modelId });
      } catch {
        // ignore
      }
      this.resident.delete(id);
    }
  }
}
