import { z } from "zod";
import {
  newUlid,
  personShape,
  placeShape,
  eventShape,
  taskShape,
  externalRefShape,
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
  folderId: string;
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
    folderId: input.folderId,
  };
  // The LLM-extraction schema is intentionally looser than the strict
  // domain shapes (e.g. extractionShape.events[].startsAt is z.string(),
  // but eventShape.startsAt requires a regex-matched ISO timestamp).
  // Filter out per-entity shape failures here so one bad event/task does
  // NOT abort the whole capture. The memory itself is the load-bearing
  // record; derived entities are lossy by design.
  const people = filterByShape(personShape, ext.people.map((p) => ({
    ...makeBase(input.ownerPeerId),
    displayName: p.displayName,
    aliases: p.aliases,
  })), "person");
  const places = filterByShape(placeShape, ext.places.map((p) => ({
    ...makeBase(input.ownerPeerId),
    name: p.name,
  })), "place");
  const events = filterByShape(eventShape, ext.events.map((e) => ({
    ...makeBase(input.ownerPeerId),
    title: e.title,
    startsAt: e.startsAt,
    ...(e.endsAt ? { endsAt: e.endsAt } : {}),
  })), "event");
  const tasks = filterByShape(taskShape, ext.tasks.map((t) => ({
    ...makeBase(input.ownerPeerId),
    title: t.title,
    status: t.status,
    ...(t.dueAt ? { dueAt: t.dueAt } : {}),
  })), "task");
  const externalRefs = filterByShape(externalRefShape, ext.externalRefs.map((r) => ({
    ...makeBase(input.ownerPeerId),
    system: r.system,
    externalId: r.externalId,
    ...(r.url ? { url: r.url } : {}),
  })), "externalRef");
  return { memory, people, places, events, tasks, externalRefs };
}

// The LLM-extraction schema is intentionally looser than the strict domain
// shapes (e.g. extractionShape.events[].startsAt is z.string(), while
// eventShape.startsAt requires regex-matched ISO). filterByShape drops
// per-entity failures with a warning so one bad event/task doesn't abort
// the whole capture. Memory itself is built from server-side timestamps
// and never invalidates.
function filterByShape<T>(shape: z.ZodType<T>, values: readonly unknown[], kind: string): T[] {
  const out: T[] = [];
  for (const v of values) {
    const r = shape.safeParse(v);
    if (r.success) {
      out.push(r.data);
    } else {
      console.warn(
        `[vault] dropping invalid ${kind} from extraction:`,
        r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")
      );
    }
  }
  return out;
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
      folderId: input.folderId,
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
