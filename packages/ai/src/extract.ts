import { z } from "zod";
import {
  newUlid,
  type Memory,
  type Person,
  type Place,
  type Event,
  type Task,
  type ExternalRef,
  type Ulid,
} from "@vault/domain";
import { complete } from "./llm.js";
import { ModelPool } from "./model-pool.js";

const extractionShape = z.object({
  summary: z.string().min(1),
  body: z.string(),
  confidence: z.number().min(0).max(1),
  tags: z.array(z.string()),
  people: z.array(z.object({ displayName: z.string(), aliases: z.array(z.string()) })),
  places: z.array(z.object({ name: z.string() })),
  events: z.array(
    z.object({
      title: z.string(),
      startsAt: z.string(),
      endsAt: z.string().optional(),
    })
  ),
  tasks: z.array(
    z.object({
      title: z.string(),
      status: z.enum(["open", "done", "cancelled"]),
      dueAt: z.string().optional(),
    })
  ),
  externalRefs: z.array(
    z.object({
      system: z.enum(["jira", "github", "linear", "url"]),
      externalId: z.string(),
      url: z.string().url().optional(),
    })
  ),
});
type Extraction = z.infer<typeof extractionShape>;

const SYSTEM_PROMPT = `You extract structured information from text. Respond with ONE JSON object matching this shape:
{
  "summary": string (one sentence),
  "body": string (the captured content, rewritten for clarity if needed),
  "confidence": number 0..1,
  "tags": string[],
  "people": [{"displayName": string, "aliases": string[]}],
  "places": [{"name": string}],
  "events": [{"title": string, "startsAt": ISO8601, "endsAt"?: ISO8601}],
  "tasks": [{"title": string, "status": "open"|"done"|"cancelled", "dueAt"?: ISO8601}],
  "externalRefs": [{"system": "jira"|"github"|"linear"|"url", "externalId": string, "url"?: string}]
}
Output ONLY valid JSON. No commentary.`;

export interface ExtractInput {
  sourceRecordId: Ulid;
  text: string;
  ownerPeerId: string;
}

export interface ExtractionResult {
  memory: Memory;
  people: Person[];
  places: Place[];
  events: Event[];
  tasks: Task[];
  externalRefs: ExternalRef[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeBase(ownerPeerId: string) {
  const t = nowIso();
  return {
    id: newUlid(),
    createdAt: t,
    updatedAt: t,
    ownerPeerId,
    provenance: { kind: "extraction" as const },
  };
}

function buildResult(
  ext: Extraction,
  input: ExtractInput
): ExtractionResult {
  const memory: Memory = {
    ...makeBase(input.ownerPeerId),
    summary: ext.summary,
    body: ext.body,
    sourceRecordId: input.sourceRecordId,
    confidence: ext.confidence,
    tags: ext.tags,
    requestableScopes: ["metadata", "snippet", "file"],
  };
  const people: Person[] = ext.people.map((p) => ({
    ...makeBase(input.ownerPeerId),
    displayName: p.displayName,
    aliases: p.aliases,
  }));
  const places: Place[] = ext.places.map((p) => ({
    ...makeBase(input.ownerPeerId),
    name: p.name,
  }));
  const events: Event[] = ext.events.map((e) => ({
    ...makeBase(input.ownerPeerId),
    title: e.title,
    startsAt: e.startsAt,
    ...(e.endsAt ? { endsAt: e.endsAt } : {}),
  }));
  const tasks: Task[] = ext.tasks.map((t) => ({
    ...makeBase(input.ownerPeerId),
    title: t.title,
    status: t.status,
    ...(t.dueAt ? { dueAt: t.dueAt } : {}),
  }));
  const externalRefs: ExternalRef[] = ext.externalRefs.map((r) => ({
    ...makeBase(input.ownerPeerId),
    system: r.system,
    externalId: r.externalId,
    ...(r.url ? { url: r.url } : {}),
  }));
  return { memory, people, places, events, tasks, externalRefs };
}

export async function extractFromText(
  pool: ModelPool,
  input: ExtractInput
): Promise<ExtractionResult> {
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: input.text },
  ];
  let raw = await complete(pool, messages);
  let parsed = safeParse(raw);
  if (!parsed.ok) {
    const retry = await complete(pool, [
      ...messages,
      {
        role: "user",
        content: `Your previous output failed schema: ${parsed.error}. Respond with valid JSON only.`,
      },
    ]);
    raw = retry;
    parsed = safeParse(raw);
  }
  if (!parsed.ok) {
    // Low-confidence fallback: store the raw input as a 0.1-confidence memory.
    const fallback: Memory = {
      ...makeBase(input.ownerPeerId),
      summary: input.text.slice(0, 200),
      body: input.text,
      sourceRecordId: input.sourceRecordId,
      confidence: 0.1,
      tags: [],
      requestableScopes: ["metadata", "snippet", "file"],
    };
    return {
      memory: fallback,
      people: [],
      places: [],
      events: [],
      tasks: [],
      externalRefs: [],
    };
  }
  return buildResult(parsed.value, input);
}

type ParseResult =
  | { ok: true; value: Extraction }
  | { ok: false; error: string };

function safeParse(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const result = extractionShape.safeParse(json);
  if (!result.success) {
    return { ok: false, error: result.error.message };
  }
  return { ok: true, value: result.data };
}
