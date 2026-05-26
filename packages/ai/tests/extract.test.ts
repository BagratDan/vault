import { describe, expect, it, beforeEach, vi } from "vitest";
import { extractFromText } from "../src/extract.js";
import { ModelPool } from "../src/model-pool.js";

let completionCalls = 0;
let completionResponses: string[] = [];

vi.mock("@qvac/sdk", () => ({
  loadModel: vi.fn(async () => "llama"),
  unloadModel: vi.fn().mockResolvedValue(undefined),
  // Real SDK: completion(...) returns CompletionRun synchronously with
  // text: Promise<string>. Vault's complete() wrapper awaits run.text.
  completion: vi.fn(() => {
    const resp = completionResponses[completionCalls] ?? "{}";
    completionCalls++;
    return {
      requestId: "mock-req",
      events: (async function* () {})(),
      final: Promise.resolve({ contentText: resp, raw: { fullText: resp } }),
      text: Promise.resolve(resp),
      tokenStream: (async function* () {})(),
    };
  }),
  LLAMA_3_2_1B_INST_Q4_0: { id: "llm" },
  EMBEDDINGGEMMA_300M_Q4_0: { id: "emb" },
  TTS_EN_ES_CHATTERBOX_Q4F16: { id: "tts" },
  PARAKEET_TDT_ENCODER_INT8: { id: "p-enc" },
  PARAKEET_TDT_DECODER_INT8: { id: "p-dec" },
  PARAKEET_TDT_PREPROCESSOR_INT8: { id: "p-pre" },
  PARAKEET_TDT_VOCAB: { id: "p-vocab" },
}));

describe("extractFromText", () => {
  let pool: ModelPool;
  beforeEach(() => {
    pool = new ModelPool({ memoryPressureFloor: 0.95 });
    completionCalls = 0;
    completionResponses = [];
    vi.clearAllMocks();
  });

  it("parses a well-formed extraction on the first try", async () => {
    completionResponses = [
      JSON.stringify({
        summary: "Sarah promised the migration by Friday",
        body: "Sarah said she'd ship the migration by Friday.",
        confidence: 0.92,
        tags: ["commitment", "migration"],
        people: [{ displayName: "Sarah", aliases: ["S"] }],
        events: [],
        tasks: [
          {
            title: "Ship migration",
            status: "open",
            dueAt: "2026-05-30T17:00:00.000Z",
          },
        ],
        places: [],
        externalRefs: [],
      }),
    ];
    const ownerPeerId = "a".repeat(64);
    const out = await extractFromText(pool, {
      sourceRecordId: "01J0".padEnd(26, "A") as never,
      text: "Sarah said she'd ship the migration by Friday.",
      ownerPeerId,
    });
    expect(out.memory.summary).toMatch(/Sarah/);
    expect(out.memory.confidence).toBeCloseTo(0.92);
    expect(out.people).toHaveLength(1);
    expect(out.tasks).toHaveLength(1);
    expect(completionCalls).toBe(1);
  });

  it("retries once on schema failure and succeeds", async () => {
    completionResponses = [
      "this is not json at all",
      JSON.stringify({
        summary: "fallback",
        body: "fallback",
        confidence: 0.5,
        tags: [],
        people: [],
        events: [],
        tasks: [],
        places: [],
        externalRefs: [],
      }),
    ];
    const out = await extractFromText(pool, {
      sourceRecordId: "01J0".padEnd(26, "A") as never,
      text: "noisy input",
      ownerPeerId: "a".repeat(64),
    });
    expect(out.memory.summary).toBe("fallback");
    expect(completionCalls).toBe(2);
  });

  it("falls back to confidence=0.1 raw-text memory after second failure", async () => {
    completionResponses = ["nope", "still nope"];
    const out = await extractFromText(pool, {
      sourceRecordId: "01J0".padEnd(26, "A") as never,
      text: "The raw text we will store.",
      ownerPeerId: "a".repeat(64),
    });
    expect(out.memory.confidence).toBe(0.1);
    expect(out.memory.body).toBe("The raw text we will store.");
    expect(completionCalls).toBe(2);
  });

  // Regression: a single bad LLM event (non-ISO startsAt) used to throw
  // at Repo.putEvent and abort the entire capture, losing the memory.
  // We now drop invalid derived entities and keep the memory.
  it("drops events with non-ISO startsAt instead of throwing", async () => {
    completionResponses = [
      JSON.stringify({
        summary: "Sarah promised the migration by Friday",
        body: "Sarah said she'd ship the migration by Friday.",
        confidence: 0.92,
        tags: ["commitment"],
        people: [],
        places: [],
        events: [
          { title: "Ship migration", startsAt: "by Friday" }, // bad
          { title: "Demo", startsAt: "2026-05-30T17:00:00.000Z" }, // good
        ],
        tasks: [],
        externalRefs: [],
      }),
    ];
    const out = await extractFromText(pool, {
      sourceRecordId: "01J0".padEnd(26, "A") as never,
      text: "Sarah said she'd ship the migration by Friday.",
      ownerPeerId: "a".repeat(64),
    });
    expect(out.memory.summary).toMatch(/Sarah/);
    expect(out.events).toHaveLength(1);
    expect(out.events[0]!.title).toBe("Demo");
  });
});
