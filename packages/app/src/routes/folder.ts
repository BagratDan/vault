import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  newUlid,
  type Folder,
  type FolderPublic,
  type FolderVisibility,
  type Memory,
  type SourceRecord,
} from "@vault/domain";
import { signCanonical, type FolderLocal, type Repo, type Indexes } from "@vault/sync";
import {
  parseText,
  parsePdf,
  parseDocx,
  parseAudio,
  scanFolder,
  type ScannedFile,
} from "@vault/ingest";
import { type ModelPool } from "@vault/ai";
import type { Workspace } from "@vault/retrieval";
import type { VaultFs } from "../vault-fs.js";
import { chunkAndEmbed } from "../chunk-embed.js";

export interface FolderRoutesDeps {
  fs: VaultFs;
  folderLocal: FolderLocal;
  getRepo: () => Repo;
  getIndexes: () => Indexes;
  pool: ModelPool;
  ownerPeerId: string;
  storeSecretKey: Uint8Array;
  broadcast: (msg: unknown) => void;
  /** @qvac/rag search workspace — ingested memories must be embedded here. */
  workspace: Workspace;
  /** Awaits autobee apply() so locally-appended writes become visible. */
  flushStore: () => Promise<void>;
}

export async function folderAdd(
  deps: FolderRoutesDeps,
  input: { path: string; displayName: string; visibility: FolderVisibility }
): Promise<{ folderId: string; displayName: string }> {
  const abs = await deps.fs.resolveSafeAbsolute(input.path);
  const stat = await fs.stat(abs).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`folder-not-readable: ${abs}`);
  }
  const existing = await deps.folderLocal.listFolders();
  for (const f of existing) {
    if (f.path === abs && f.ownerPeerId === deps.ownerPeerId && !f.deletedAt) {
      throw new Error(`folder-exists: ${abs}`);
    }
  }
  const now = new Date().toISOString();
  const folderId = newUlid();
  const fullRecord: Folder = {
    id: folderId,
    createdAt: now,
    updatedAt: now,
    ownerPeerId: deps.ownerPeerId,
    provenance: { kind: "user" },
    kind: "folder",
    path: abs,
    displayName: input.displayName,
    visibility: input.visibility,
  };
  await deps.folderLocal.putFolder(fullRecord);
  const publicBody = {
    id: folderId,
    createdAt: now,
    updatedAt: now,
    ownerPeerId: deps.ownerPeerId,
    provenance: { kind: "user" as const },
    kind: "folder" as const,
    displayName: input.displayName,
    visibility: input.visibility,
  };
  const publicRecord: FolderPublic = {
    ...publicBody,
    sig: signCanonical(publicBody, deps.storeSecretKey),
  };
  // Only public folders write to autobee; private folders stay local.
  if (input.visibility === "public") {
    await deps.getRepo().putFolderPublic(publicRecord);
    // Flush so the appended folder record is visible to a subsequent
    // folder.list (autobee appends aren't in the view until apply() runs).
    await deps.flushStore();
  }
  void runIngest(deps, fullRecord);
  return { folderId, displayName: input.displayName };
}

async function runIngest(deps: FolderRoutesDeps, folder: Folder): Promise<void> {
  deps.broadcast({ kind: "folder.ingest-progress", folderId: folder.id, current: 0, total: 0, phase: "scanning" });
  let scanned: ScannedFile[] = [];
  try {
    scanned = await scanFolder(folder.path);
  } catch {
    deps.broadcast({ kind: "folder.ingest-done", folderId: folder.id, ingested: 0, skipped: 0, errors: 1 });
    return;
  }
  const total = scanned.length;
  let ingested = 0;
  let skipped = 0;
  let errors = 0;
  for (let i = 0; i < total; i++) {
    const file = scanned[i]!;
    deps.broadcast({
      kind: "folder.ingest-progress",
      folderId: folder.id,
      current: i + 1,
      total,
      phase: "extracting",
      currentFile: path.basename(file.absPath),
    });
    try {
      const buf = await fs.readFile(file.absPath);
      const hash = "sha256:" + crypto.createHash("sha256").update(buf).digest("hex");
      let text = "";
      const isAudio = [".mp3", ".wav", ".m4a", ".flac", ".ogg"].includes(file.ext);
      if (file.ext === ".txt" || file.ext === ".md" || file.ext === ".markdown") {
        text = await parseText(new Uint8Array(buf));
      } else if (file.ext === ".pdf") {
        text = await parsePdf(new Uint8Array(buf));
      } else if (file.ext === ".docx") {
        text = await parseDocx(new Uint8Array(buf));
      } else if (isAudio) {
        text = await parseAudio({ pool: deps.pool }, new Uint8Array(buf));
      }
      if (!text.trim()) {
        skipped++;
        continue;
      }
      const now = new Date().toISOString();
      const sourceId = newUlid();
      const source: SourceRecord = {
        id: sourceId,
        createdAt: now,
        updatedAt: now,
        ownerPeerId: deps.ownerPeerId,
        provenance: { kind: "user" },
        kind: "file",
        path: file.absPath,
        hash,
        size: file.size,
        mime: extToMime(file.ext),
        lastModified: file.lastModified,
      };
      await deps.getRepo().putSourceRecord(source);
      const memory: Memory = {
        id: newUlid(),
        createdAt: now,
        updatedAt: now,
        ownerPeerId: deps.ownerPeerId,
        provenance: { kind: "extraction" },
        summary: text.slice(0, 200),
        body: text,
        sourceRecordId: sourceId,
        confidence: 0.5,
        tags: [],
        requestableScopes: ["metadata", "snippet", "file"],
        folderId: folder.id,
      };
      await deps.getRepo().putMemoryByVisibility(memory, folder.visibility);
      // Chunk + embed so large files are searchable (whole-body embed
      // overflowed EmbeddingGemma's 1024-token limit and silently failed).
      await chunkAndEmbed(
        { pool: deps.pool, workspace: deps.workspace, ownerPeerId: deps.ownerPeerId },
        memory
      );
      ingested++;
    } catch {
      errors++;
    }
  }
  // Flush once after the loop so all the public memories (and their folder
  // record) are visible to folder.list and search dedup reads. One flush at
  // the end is enough — flushing per-file would be slow.
  await deps.flushStore();
  deps.broadcast({ kind: "folder.ingest-done", folderId: folder.id, ingested, skipped, errors });
}

function extToMime(ext: string): string {
  const map: Record<string, string> = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".flac": "audio/flac",
    ".ogg": "audio/ogg",
  };
  return map[ext] ?? "application/octet-stream";
}

export async function folderList(deps: FolderRoutesDeps): Promise<{
  folders: Array<{
    folderId: string;
    displayName: string;
    visibility: FolderVisibility;
    ownerPeerId: string;
    fileCount: number;
    createdAt: string;
    path?: string;
  }>;
}> {
  const publicFolders = await deps.getRepo().listFoldersPublic();
  const localFolders = await deps.folderLocal.listFolders();
  const ownById = new Map(localFolders.map((f) => [f.id, f] as const));

  type Entry = {
    folderId: string;
    displayName: string;
    visibility: FolderVisibility;
    ownerPeerId: string;
    fileCount: number;
    createdAt: string;
    path?: string;
  };
  const out: Entry[] = [];

  for (const f of publicFolders) {
    if (f.deletedAt) continue;
    const memories = await deps.getRepo().listMemoriesInFolder(f.id, deps.getIndexes());
    const entry: Entry = {
      folderId: f.id,
      displayName: f.displayName,
      visibility: f.visibility,
      ownerPeerId: f.ownerPeerId,
      fileCount: memories.filter((m) => !m.deletedAt).length,
      createdAt: f.createdAt,
    };
    const own = ownById.get(f.id);
    if (own && f.ownerPeerId === deps.ownerPeerId) entry.path = own.path;
    out.push(entry);
  }
  for (const f of localFolders) {
    if (f.visibility !== "private") continue;
    if (f.deletedAt) continue;
    if (out.some((x) => x.folderId === f.id)) continue;
    const memories = await deps.folderLocal.listPrivateMemoriesByFolder(f.id);
    out.push({
      folderId: f.id,
      displayName: f.displayName,
      visibility: f.visibility,
      ownerPeerId: f.ownerPeerId,
      fileCount: memories.filter((m) => !m.deletedAt).length,
      createdAt: f.createdAt,
      path: f.path,
    });
  }
  return { folders: out };
}

export async function folderUpdate(
  deps: FolderRoutesDeps,
  input: { folderId: string; visibility?: FolderVisibility; displayName?: string }
): Promise<{ folderId: string }> {
  const current = await deps.folderLocal.getFolder(input.folderId);
  if (!current) throw new Error(`folder-not-found: ${input.folderId}`);
  if (current.ownerPeerId !== deps.ownerPeerId) throw new Error(`folder-not-owner: ${input.folderId}`);
  const now = new Date().toISOString();
  const updated: Folder = {
    ...current,
    ...(input.visibility ? { visibility: input.visibility } : {}),
    ...(input.displayName ? { displayName: input.displayName } : {}),
    updatedAt: now,
  };
  await deps.folderLocal.putFolder(updated);
  if (updated.visibility === "public") {
    const publicBody = {
      id: updated.id,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      ownerPeerId: updated.ownerPeerId,
      provenance: updated.provenance,
      kind: "folder" as const,
      displayName: updated.displayName,
      visibility: updated.visibility,
    };
    const publicRecord: FolderPublic = { ...publicBody, sig: signCanonical(publicBody, deps.storeSecretKey) };
    await deps.getRepo().putFolderPublic(publicRecord);
    await deps.flushStore();
  }
  deps.broadcast({ kind: "folder.updated", folderId: updated.id });
  return { folderId: updated.id };
}

export async function folderDelete(
  deps: FolderRoutesDeps,
  input: { folderId: string }
): Promise<{ folderId: string }> {
  const current = await deps.folderLocal.getFolder(input.folderId);
  if (!current) throw new Error(`folder-not-found: ${input.folderId}`);
  if (current.ownerPeerId !== deps.ownerPeerId) throw new Error(`folder-not-owner: ${input.folderId}`);
  const now = new Date().toISOString();
  await deps.folderLocal.putFolder({ ...current, updatedAt: now, deletedAt: now });
  const memories = await deps.getRepo().listMemoriesInFolder(input.folderId, deps.getIndexes());
  for (const m of memories) {
    await deps.getRepo().markMemoryDeleted(m.id);
  }
  await deps.flushStore();
  deps.broadcast({ kind: "folder.deleted", folderId: input.folderId });
  return { folderId: input.folderId };
}

export async function folderRescan(
  deps: FolderRoutesDeps,
  input: { folderId: string }
): Promise<{ folderId: string }> {
  const folder = await deps.folderLocal.getFolder(input.folderId);
  if (!folder) throw new Error(`folder-not-found: ${input.folderId}`);
  if (folder.ownerPeerId !== deps.ownerPeerId) throw new Error(`folder-not-owner: ${input.folderId}`);
  void runIngest(deps, folder);
  return { folderId: input.folderId };
}
