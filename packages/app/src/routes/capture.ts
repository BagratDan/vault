import { newUlid, asUlid, type SourceRecord } from "@vault/domain";
import { extractFromText, transcribeAudio, type ModelPool } from "@vault/ai";
import { Repo, Indexes } from "@vault/sync";
import { Workspace } from "@vault/retrieval";

export interface CaptureDeps {
  pool: ModelPool;
  repo: Repo;
  indexes: Indexes;
  workspace: Workspace;
  ownerPeerId: string;
}

export interface CaptureTextInput {
  text: string;
  tags: readonly string[];
}

export interface CaptureResult {
  memoryId: string;
  duplicateOf?: string;
}

export async function captureText(
  deps: CaptureDeps,
  input: CaptureTextInput
): Promise<CaptureResult> {
  // 1. SourceRecord
  const nowIso = new Date().toISOString();
  const src: SourceRecord = {
    id: newUlid(),
    createdAt: nowIso,
    updatedAt: nowIso,
    ownerPeerId: deps.ownerPeerId,
    provenance: { kind: "user" },
    kind: "text",
    body: input.text,
  };
  await deps.repo.putSourceRecord(src);

  // 2. Extract via LLM
  const ext = await extractFromText(deps.pool, {
    sourceRecordId: asUlid(src.id),
    text: input.text,
    ownerPeerId: deps.ownerPeerId,
  });

  // 3. Persist all entities
  await deps.repo.putMemory(ext.memory);
  for (const p of ext.people) await deps.repo.putPerson(p);
  for (const pl of ext.places) await deps.repo.putPlace(pl);
  for (const e of ext.events) await deps.repo.putEvent(e);
  for (const t of ext.tasks) await deps.repo.putTask(t);
  for (const r of ext.externalRefs) await deps.repo.putExternalRef(r);

  // 4. Secondary indexes (tags from extraction + user-provided tags merged)
  const allTags = [...ext.memory.tags, ...input.tags];
  await deps.indexes.indexTags(ext.memory.id, allTags);
  await deps.indexes.indexPersons(
    ext.memory.id,
    ext.people.map((p) => p.id)
  );

  // 5. Ingest into @qvac/rag workspace (computes + stores the embedding)
  await deps.workspace.ingest({
    memoryId: asUlid(ext.memory.id),
    body: ext.memory.body,
    tags: ext.memory.tags,
    metadata: {
      ownerPeerId: deps.ownerPeerId,
      createdAt: ext.memory.createdAt,
    },
  });

  // Note: cosine-≥0.92 dedup against existing memories (spec §9.3 step 6)
  // is deferred. Doing it correctly requires querying ragSearch with a
  // 1-K threshold lookup before ingest; the dedup module ships in @vault/ai
  // but the orchestration lives in Plan 2 (where it's clearer how
  // duplicates across peers should be handled).

  return { memoryId: ext.memory.id };
}

export interface CaptureAudioInput {
  audio: Uint8Array;
  tags: readonly string[];
}

export async function captureAudio(
  deps: CaptureDeps,
  input: CaptureAudioInput
): Promise<CaptureResult> {
  const transcript = await transcribeAudio(deps.pool, input.audio);
  const text = transcript.segments.map((s) => s.text).join(" ");
  // Persist the audio SourceRecord (the bytes themselves stay on disk
  // outside Autobee; only the ref + transcript metadata are stored).
  const nowIso = new Date().toISOString();
  const src: SourceRecord = {
    id: newUlid(),
    createdAt: nowIso,
    updatedAt: nowIso,
    ownerPeerId: deps.ownerPeerId,
    provenance: { kind: "audio-import" },
    kind: "audio",
    audioRef: `vault://audio/${newUlid()}`,
    transcript,
  };
  await deps.repo.putSourceRecord(src);

  // Reuse the text capture pipeline from this point
  return captureText(
    {
      pool: deps.pool,
      repo: deps.repo,
      indexes: deps.indexes,
      workspace: deps.workspace,
      ownerPeerId: deps.ownerPeerId,
    },
    { text, tags: input.tags }
  );
}
