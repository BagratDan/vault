const AI_ERROR_BRAND = Symbol("vault.ai.error");

abstract class AiError extends Error {
  readonly [AI_ERROR_BRAND] = true;
  abstract readonly userMessage: string;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = this.constructor.name;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export class ModelLoadError extends AiError {
  readonly userMessage = "Model unavailable — see Settings → Models.";
  constructor(public readonly modelId: string, cause?: unknown) {
    super(`Failed to load model: ${modelId}`, { cause });
  }
}

export class InferenceOomError extends AiError {
  readonly userMessage = "Out of memory — try a shorter prompt or close other applications.";
  constructor(public readonly modelId: string, public readonly requestedBytes: number, cause?: unknown) {
    super(`OOM during inference on ${modelId} (requested ~${requestedBytes} bytes)`, { cause });
  }
}

export class InferenceRuntimeError extends AiError {
  readonly userMessage = "Inference failed — the model crashed unexpectedly. Retrying once.";
  constructor(public readonly modelId: string, cause?: unknown) {
    super(`Runtime error during inference on ${modelId}`, { cause });
  }
}

export class HardwareUnsupportedError extends AiError {
  readonly userMessage = "Your hardware is not supported. See the README for requirements.";
  constructor(public readonly requirement: string) {
    super(`Hardware unsupported: required ${requirement}`);
  }
}

export class ModelDownloadError extends AiError {
  readonly userMessage = "Model download failed — check disk space and network, then retry.";
  constructor(public readonly modelId: string, public readonly bytesNeeded?: number, cause?: unknown) {
    super(`Failed to download model ${modelId}${bytesNeeded ? ` (need ~${bytesNeeded} bytes)` : ""}`, { cause });
  }
}

export function isAiError(value: unknown): value is AiError {
  return typeof value === "object" && value !== null && AI_ERROR_BRAND in value;
}
