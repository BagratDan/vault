import { describe, expect, it } from "vitest";
import {
  ModelLoadError,
  InferenceOomError,
  HardwareUnsupportedError,
  isAiError,
} from "../src/errors.js";

describe("ai errors", () => {
  it("ModelLoadError carries modelId and cause", () => {
    const cause = new Error("file not found");
    const e = new ModelLoadError("LLAMA_3_2_1B_INST_Q4_0", cause);
    expect(e.name).toBe("ModelLoadError");
    expect(e.modelId).toBe("LLAMA_3_2_1B_INST_Q4_0");
    expect(e.cause).toBe(cause);
    expect(e.userMessage).toMatch(/Model unavailable/);
  });

  it("InferenceOomError suggests next steps", () => {
    const e = new InferenceOomError("LLAMA_3_2_1B_INST_Q4_0", 2_000_000_000);
    expect(e.userMessage).toMatch(/Out of memory/);
    expect(e.requestedBytes).toBe(2_000_000_000);
  });

  it("HardwareUnsupportedError names the requirement", () => {
    const e = new HardwareUnsupportedError("Apple Silicon or NVIDIA consumer GPU");
    expect(e.requirement).toBe("Apple Silicon or NVIDIA consumer GPU");
  });

  it("isAiError discriminates", () => {
    expect(isAiError(new ModelLoadError("x"))).toBe(true);
    expect(isAiError(new Error("plain"))).toBe(false);
    expect(isAiError(null)).toBe(false);
  });
});
