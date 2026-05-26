import {
  newUlid,
  asUlid,
  type SourceRecord,
  type Relationship,
} from "@vault/domain";
import {
  ensureEmbedModel,
  embedText,
  extractFromText,
  transcribeAudio,
  type ModelPool,
} from "@vault/ai";
import { Repo, Indexes } from "@vault/sync";
import { Workspace, search } from "@vault/retrieval";
import { VaultFs } from "../vault-fs.js";

export interface CaptureDeps {
  pool: ModelPool;
  repo: Repo;
  indexes: Indexes;
  workspace: Workspace;
  fs: VaultFs;
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

  // 3. Embed the memory body. The same vector is reused for dedup-search
  //    and for the workspace ingest below, so we only run the embedding
  //    model once per capture. Loads the model on first call.
  const embedModelId = await ensureEmbedModel(deps.pool);
  const vector = await embedText(deps.pool, ext.memory.body);

  // 4. Dedup check (spec §9.3 step 6). Query @qvac/rag for the top-1
  //    existing memory matching the new body; if its similarity score is
  //    at or above the threshold, we DON'T ingest a new memory — instead
  //    we link the existing one with a Relationship(type='duplicate-of').
  const DEDUP_THRESHOLD = 0.92;
  let duplicateOf: string | undefined;
  try {
    const hits = await search({
      modelId: embedModelId,
      workspace: deps.workspace.getName(),
      query: ext.memory.body,
      k: 1,
    });
    const top = hits[0];
    if (top && top.score >= DEDUP_THRESHOLD) {
      duplicateOf = top.memoryId;
      const rel: Relationship = {
        id: newUlid(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ownerPeerId: deps.ownerPeerId,
        provenance: { kind: "extraction" },
        fromId: asUlid(top.memoryId),
        toId: ext.memory.id,
        type: "duplicate-of",
      };
      await deps.repo.putRelationship(rel);
      return { memoryId: top.memoryId, duplicateOf };
    }
  } catch {
    // Dedup is best-effort; if @qvac/rag throws (e.g. empty workspace),
    // fall through and ingest as new.
  }

  // 5. Persist all entities
  await deps.repo.putMemory(ext.memory);
  for (const p of ext.people) await deps.repo.putPerson(p);
  for (const pl of ext.places) await deps.repo.putPlace(pl);
  for (const e of ext.events) await deps.repo.putEvent(e);
  for (const t of ext.tasks) await deps.repo.putTask(t);
  for (const r of ext.externalRefs) await deps.repo.putExternalRef(r);

  // 6. Secondary indexes (tags from extraction + user-provided tags merged)
  const allTags = [...ext.memory.tags, ...input.tags];
  await deps.indexes.indexTags(ext.memory.id, allTags);
  await deps.indexes.indexPersons(
    ext.memory.id,
    ext.people.map((p) => p.id)
  );

  // 7. Save the pre-computed embedding into the @qvac/rag workspace.
  await deps.workspace.ingest({
    memoryId: asUlid(ext.memory.id),
    body: ext.memory.body,
    tags: ext.memory.tags,
    embedding: vector,
    embeddingModelId: embedModelId,
    metadata: {
      ownerPeerId: deps.ownerPeerId,
      createdAt: ext.memory.createdAt,
    },
  });

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
  // Persist the audio bytes under VAULT_ROOT/audio/<id>.bin and record a
  // ref pointing at the on-disk path. The bytes themselves never go into
  // Autobee (spec §7.2: file bodies do not sync).
  const nowIso = new Date().toISOString();
  const audioId = newUlid();
  const audioRel = `audio/${audioId}.bin`;
  await deps.fs.writeFile(audioRel, input.audio);
  const src: SourceRecord = {
    id: newUlid(),
    createdAt: nowIso,
    updatedAt: nowIso,
    ownerPeerId: deps.ownerPeerId,
    provenance: { kind: "audio-import" },
    kind: "audio",
    audioRef: `vault://${audioRel}`,
    transcript,
  };
  await deps.repo.putSourceRecord(src);

  // Reuse the text capture pipeline from this point
  return captureText(deps, { text, tags: input.tags });
}
