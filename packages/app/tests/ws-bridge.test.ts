import { describe, expect, it } from "vitest";
import { clientMessageShape, serverMessageShape } from "../src/messages.js";

describe("WS messages", () => {
  it("captureText is well-formed", () => {
    const m = { kind: "capture.text" as const, text: "hello", tags: ["t"] };
    expect(clientMessageShape.safeParse(m).success).toBe(true);
  });

  it("captureAudio rejects when audioBase64 missing", () => {
    const m = { kind: "capture.audio", tags: [] };
    expect(clientMessageShape.safeParse(m).success).toBe(false);
  });

  it("search.run minimal shape", () => {
    const m = { kind: "search.run" as const, query: "indemnification", k: 8 };
    expect(clientMessageShape.safeParse(m).success).toBe(true);
  });

  it("server answer.chunk discriminates correctly", () => {
    const m = {
      kind: "answer.chunk" as const,
      requestId: "01J0".padEnd(26, "A"),
      text: "Hi",
    };
    expect(serverMessageShape.safeParse(m).success).toBe(true);
  });
});
