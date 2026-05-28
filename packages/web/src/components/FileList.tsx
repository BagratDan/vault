import React from "react";

export interface FileItem {
  memoryId: string;
  summary: string;
  createdAt: string;
  tags: readonly string[];
}

export interface FileListProps {
  files: readonly FileItem[];
}

export function FileList({ files }: FileListProps) {
  if (files.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        No files indexed yet. If this folder is being scanned, watch the
        progress at the top of this view.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {files.map((f) => (
        <li key={f.memoryId} className="rounded-xl bg-slate-800 p-3 ring-1 ring-slate-800/60">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="font-mono text-xs text-slate-500">{f.memoryId.slice(0, 8)}</span>
            <span className="font-mono text-xs text-slate-500">
              {new Date(f.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
          </div>
          <p className="text-sm text-slate-100">{f.summary}</p>
          {f.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {f.tags.map((t) => (
                <span key={t} className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">{t}</span>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
