import { describe, expect, it, vi } from "vitest";

vi.mock("@vault/ai", () => ({
  transcribeAudio: vi.fn(async () => ({
    segments: [
      { text: "Sarah promised the migration", confidence: 0.9 },
      { text: "by Friday.", confidence: 0.85 },
    ],
  })),
}));

import { parseAudio } from "../src/parsers/audio.js";

describe("parseAudio", () => {
  it("joins transcript segments into one string", async () => {
    const out = await parseAudio({ pool: {} as never }, new Uint8Array(1));
    expect(out).toBe("Sarah promised the migration by Friday.");
  });
});
