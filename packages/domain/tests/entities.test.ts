import { describe, expect, it } from "vitest";
import { newUlid } from "../src/ids.js";
import {
  memoryShape,
  personShape,
  placeShape,
  eventShape,
  taskShape,
  externalRefShape,
  relationshipShape,
  sourceRecordShape,
  transcriptShape,
} from "../src/index.js";

const base = {
  id: newUlid(),
  createdAt: "2026-05-26T10:00:00.000Z",
  updatedAt: "2026-05-26T10:00:00.000Z",
  ownerPeerId: "a".repeat(64),
  provenance: { kind: "user" as const },
};

describe("entity schemas", () => {
  it("memoryShape accepts a typed-text-backed memory", () => {
    const m = {
      ...base,
      summary: "Promised the auth migration by Friday",
      body: "We discussed the auth migration. I committed to ship by Friday.",
      sourceRecordId: newUlid(),
      confidence: 0.92,
      tags: ["auth", "commitment"],
      requestableScopes: ["snippet", "file"] as const,
      folderId: "01J0CAPTVRES000000000000AA",
    };
    expect(memoryShape.safeParse(m).success).toBe(true);
  });

  it("memoryShape rejects negative confidence", () => {
    const m = {
      ...base,
      summary: "x",
      body: "x",
      sourceRecordId: newUlid(),
      confidence: -0.1,
      tags: [],
      requestableScopes: [],
      folderId: "01J0CAPTVRES000000000000AA",
    };
    expect(memoryShape.safeParse(m).success).toBe(false);
  });

  it("memoryShape rejects requestableScopes with unknown value", () => {
    const m = {
      ...base,
      summary: "x",
      body: "x",
      sourceRecordId: newUlid(),
      confidence: 1,
      tags: [],
      requestableScopes: ["snippet", "bogus"],
      folderId: "01J0CAPTVRES000000000000AA",
    };
    expect(memoryShape.safeParse(m).success).toBe(false);
  });

  it("personShape accepts displayName + aliases", () => {
    const p = { ...base, displayName: "Mara Lee", aliases: ["Mara", "M.L."] };
    expect(personShape.safeParse(p).success).toBe(true);
  });

  it("placeShape allows optional geo", () => {
    const p1 = { ...base, name: "HQ" };
    const p2 = { ...base, name: "HQ", geo: { lat: 37.77, lon: -122.42 } };
    expect(placeShape.safeParse(p1).success).toBe(true);
    expect(placeShape.safeParse(p2).success).toBe(true);
  });

  it("eventShape requires startsAt", () => {
    const e = { ...base, title: "Standup", startsAt: "2026-05-26T09:00:00.000Z" };
    expect(eventShape.safeParse(e).success).toBe(true);
    const { startsAt: _, ...bad } = e;
    expect(eventShape.safeParse(bad).success).toBe(false);
  });

  it("taskShape constrains status enum", () => {
    const t = { ...base, title: "Ship migration", status: "open" as const };
    expect(taskShape.safeParse(t).success).toBe(true);
    expect(taskShape.safeParse({ ...t, status: "blocked" }).success).toBe(false);
  });

  it("externalRefShape constrains system enum", () => {
    const r = { ...base, system: "jira" as const, externalId: "PROJ-412" };
    expect(externalRefShape.safeParse(r).success).toBe(true);
    expect(externalRefShape.safeParse({ ...r, system: "slack" }).success).toBe(false);
  });

  it("relationshipShape requires from/to/type", () => {
    const rel = {
      ...base,
      fromId: newUlid(),
      toId: newUlid(),
      type: "mentions" as const,
    };
    expect(relationshipShape.safeParse(rel).success).toBe(true);
  });

  it("sourceRecordShape: text variant", () => {
    const s = { ...base, kind: "text" as const, body: "hello" };
    expect(sourceRecordShape.safeParse(s).success).toBe(true);
  });

  it("sourceRecordShape: audio variant accepts transcript", () => {
    const s = {
      ...base,
      kind: "audio" as const,
      audioRef: "vault://audio/abc",
      transcript: {
        segments: [
          { text: "Hello", startMs: 0, endMs: 500, confidence: 0.95, speaker: "A" },
        ],
        durationMs: 500,
      },
    };
    expect(sourceRecordShape.safeParse(s).success).toBe(true);
  });

  it("sourceRecordShape: file variant requires hash and mime", () => {
    const s = {
      ...base,
      kind: "file" as const,
      path: "/vault/files/x.pdf",
      mime: "application/pdf",
      hash: "sha256:" + "a".repeat(64),
      size: 1024,
      lastModified: "2026-05-26T10:00:00.000Z",
    };
    expect(sourceRecordShape.safeParse(s).success).toBe(true);
  });

  it("transcriptShape tolerates [INAUDIBLE] segments", () => {
    const t = {
      segments: [
        { text: "Hello", startMs: 0, endMs: 500, confidence: 0.95 },
        { text: "[INAUDIBLE]", startMs: 500, endMs: 600, confidence: 0 },
      ],
      durationMs: 600,
    };
    expect(transcriptShape.safeParse(t).success).toBe(true);
  });
});
