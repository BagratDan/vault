import React from "react";
import type { FileItem } from "./FileList.js";
import { FileList } from "./FileList.js";

export interface FolderViewMeta {
  folderId: string;
  displayName: string;
  visibility: "public" | "private";
  ownerPeerId: string;
  fileCount: number;
  path?: string;
}

export interface FolderViewProps {
  folder: FolderViewMeta;
  isOwner: boolean;
  files: readonly FileItem[];
  ingestProgress: {
    current: number;
    total: number;
    phase: "scanning" | "extracting" | "embedding" | "done";
    currentFile?: string;
  } | null;
  onBack: () => void;
  onRescan: () => void;
  onToggleVisibility: (next: "public" | "private") => void;
  onDelete: () => void;
  children: React.ReactNode;
}

export function FolderView({ folder, isOwner, files, ingestProgress, onBack, onRescan, onToggleVisibility, onDelete, children }: FolderViewProps) {
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <button type="button" onClick={onBack} className="text-xs text-slate-400 hover:text-slate-200">← folders</button>
          <h1 className="text-2xl font-semibold tracking-tight"><span aria-hidden>📁 </span>{folder.displayName}</h1>
          <p className="text-xs text-slate-400">
            {folder.fileCount} {folder.fileCount === 1 ? "file" : "files"} ·{" "}
            <span className={folder.visibility === "public" ? "text-cyan-300" : ""}>{folder.visibility}</span>
            {folder.path && <span className="ml-2 font-mono text-slate-500">{folder.path}</span>}
          </p>
        </div>
        {isOwner && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onRescan} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-700">Re-scan</button>
            <button type="button" onClick={() => onToggleVisibility(folder.visibility === "public" ? "private" : "public")} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-700">
              Make {folder.visibility === "public" ? "private" : "public"}
            </button>
            <button type="button" onClick={onDelete} className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-600">Delete</button>
          </div>
        )}
      </header>

      {ingestProgress && ingestProgress.phase !== "done" && (
        <div className="rounded-xl bg-slate-900 p-3 ring-1 ring-slate-800">
          <p className="text-xs text-slate-300">
            {ingestProgress.phase === "scanning" ? "Scanning…" : `Indexing ${ingestProgress.current} of ${ingestProgress.total}`}
            {ingestProgress.currentFile && ` · ${ingestProgress.currentFile}`}
          </p>
        </div>
      )}

      {children}

      <section className="rounded-2xl bg-slate-900 p-5 shadow">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">Library</h2>
        <FileList files={files} />
      </section>
    </main>
  );
}
