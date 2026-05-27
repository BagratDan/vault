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
import { chunkAndEmbed } from "../chunk-embed.js";

export interface CaptureDeps {
  pool: ModelPool;
  repo: Repo;
  indexes: Indexes;
  workspace: Workspace;
  fs: VaultFs;
  ownerPeerId: string;
  /** This peer's "Captures" folder ID — destination for typed captures. */
  capturesFolderId: string;
}

/**
 * Write a single typed relationship edge (memory is always the `from`).
 * Best-effort per edge: if the record or index write throws (e.g. a shape
 * failure on a derived entity id), warn and continue rather than aborting the
 * whole capture — consistent with the "drop per-entity extraction failure"
 * pattern in extract.ts.
 */
async function writeEdge(
  deps: CaptureDeps,
  fromId: string,
  toId: string,
  type: Relationship["type"]
): Promise<void> {
  const t = new Date().toISOString();
  const rel: Relationship = {
    id: newUlid(),
    createdAt: t,
    updatedAt: t,
    ownerPeerId: deps.ownerPeerId,
    provenance: { kind: "extraction" },
    fromId: asUlid(fromId),
    toId: asUlid(toId),
    type,
  };
  try {
    await deps.repo.putRelationship(rel);
    await deps.indexes.indexRelationship(rel.id, fromId, toId, type);
  } catch (err) {
    console.warn(`[vault] dropping edge ${type} ${fromId}->${toId}:`, err);
  }
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
    folderId: deps.capturesFolderId,
  });

  // 3. Load the embedding model. Used for the dedup query below; the
  //    workspace indexing happens via chunkAndEmbed (step 7), which embeds
  //    each chunk under the model's token limit. A best-effort single-shot
  //    embed of the whole body powers the dedup check — if the body is too
  //    long for one batch it throws, so we skip dedup (treat as new) rather
  //    than fail the capture. Chunked indexing in step 7 still makes it
  //    findable.
  const embedModelId = await ensureEmbedModel(deps.pool);
  let dedupVector: number[] | null = null;
  try {
    dedupVector = await embedText(deps.pool, ext.memory.body);
  } catch {
    dedupVector = null;
  }

  // 4. Dedup check (spec §9.3 step 6). Query @qvac/rag for the top-1
  //    existing memory matching the new body; if its similarity score is
  //    at or above the threshold, we DON'T ingest a new memory — instead
  //    we link the existing one with a Relationship(type='duplicate-of').
  const DEDUP_THRESHOLD = 0.92;
  let duplicateOf: string | undefined;
  try {
    // Skip dedup if the body couldn't be embedded in one shot (too long);
    // a too-long body is treated as new rather than failing the capture.
    if (!dedupVector) throw new Error("dedup embed unavailable");
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

  // 5. Persist all entities. Typed/audio captures go through the normal
  //    autobee path (as in Plans 1-3). NOTE: the default "Captures" folder
  //    is labeled private in the folder list, but capture memories still
  //    replicate via Autobee like any public-folder memory — their
  //    confidentiality from peers rests on the per-memory consent gate
  //    (Plan 3), not on the storage-tier gate. See THREAT_MODEL "At-rest
  //    replication" for why this is the accepted posture. To keep a capture
  //    fully node-local, the user puts it in a folder marked private (folder
  //    ingest routes private-folder memories to the owner-local store).
  await deps.repo.putMemory(ext.memory);
  for (const p of ext.people) await deps.repo.putPerson(p);
  for (const pl of ext.places) await deps.repo.putPlace(pl);
  for (const e of ext.events) await deps.repo.putEvent(e);
  for (const t of ext.tasks) await deps.repo.putTask(t);
  for (const r of ext.externalRefs) await deps.repo.putExternalRef(r);

  // Typed relationship edges (memory is always the `from`). Tasks AND
  // externalRefs both map to "references" (intentional — see relationshipShape).
  await writeEdge(deps, ext.memory.id, src.id, "derived-from");
  for (const p of ext.people) await writeEdge(deps, ext.memory.id, p.id, "mentions");
  for (const pl of ext.places) await writeEdge(deps, ext.memory.id, pl.id, "located-at");
  for (const e of ext.events) await writeEdge(deps, ext.memory.id, e.id, "attended-by");
  for (const t of ext.tasks) await writeEdge(deps, ext.memory.id, t.id, "references");
  for (const r of ext.externalRefs) await writeEdge(deps, ext.memory.id, r.id, "references");

  // 6. Secondary indexes (tags from extraction + user-provided tags merged)
  const allTags = [...ext.memory.tags, ...input.tags];
  await deps.indexes.indexTags(ext.memory.id, allTags);
  await deps.indexes.indexPersons(
    ext.memory.id,
    ext.people.map((p) => p.id)
  );

  // Folder membership + meta side-index. Capture memories use the "Captures"
  // folder and always go through the autobee putMemory path above, so indexing
  // here mirrors the autobee storage tier (unlike runIngest, which gates these
  // by visibility). No visibility guard needed.
  await deps.indexes.indexFolderMembership(ext.memory.folderId, ext.memory.id);
  await deps.indexes.indexMeta(ext.memory.id, {
    tags: allTags,
    ownerPeerId: ext.memory.ownerPeerId,
    createdAt: ext.memory.createdAt,
    personIds: ext.people.map((p) => p.id),
  });

  // 7. Chunk + embed so long captures are searchable (a single-shot embed
  //    of the whole body overflows EmbeddingGemma's 1024-token limit).
  await chunkAndEmbed(
    { pool: deps.pool, workspace: deps.workspace, ownerPeerId: deps.ownerPeerId },
    ext.memory
  );

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
