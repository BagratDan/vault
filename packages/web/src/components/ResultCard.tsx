import React, { useState } from "react";

export interface ResultCardProps {
  memoryId: string;
  score: number;
  snippet: string;
  tags: readonly string[];
  ownerPeerId?: string;
  ownerDisplayName?: string;
  fullContentAvailable?: boolean;
  onRequestAccess?: (scope: "snippet" | "file" | "metadata") => void;
}

export function ResultCard({
  memoryId,
  score,
  snippet,
  tags,
  ownerPeerId,
  ownerDisplayName,
  fullContentAvailable,
  onRequestAccess,
}: ResultCardProps) {
  const [open, setOpen] = useState(false);
  const isRemote = !!ownerPeerId;
  return (
    <article className="rounded-xl bg-slate-900 p-4 shadow">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-mono text-xs text-slate-500">{memoryId.slice(0, 8)}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{(score * 100).toFixed(0)}%</span>
          {ownerDisplayName && (
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{ownerDisplayName}</span>
          )}
        </div>
      </div>
      <p className="text-sm text-slate-200">
        {fullContentAvailable && (
          <span className="mr-1 text-emerald-400" aria-label="granted">✓</span>
        )}
        {snippet}
      </p>
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span key={t} className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">{t}</span>
          ))}
        </div>
      )}
      {isRemote && !fullContentAvailable && onRequestAccess && (
        <div className="relative mt-3">
          <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-cyan-400">
            Request access ▾
          </button>
          {open && (
            <div className="absolute right-0 top-full z-10 mt-1 flex w-40 flex-col rounded-lg bg-slate-800 p-1 shadow-lg ring-1 ring-slate-700">
              <button type="button" onClick={() => { setOpen(false); onRequestAccess("snippet"); }} className="rounded px-3 py-1.5 text-left text-xs text-slate-100 hover:bg-slate-700">Snippet</button>
              <button type="button" onClick={() => { setOpen(false); onRequestAccess("file"); }} className="rounded px-3 py-1.5 text-left text-xs text-slate-100 hover:bg-slate-700">Full file</button>
              <button type="button" onClick={() => { setOpen(false); onRequestAccess("metadata"); }} className="rounded px-3 py-1.5 text-left text-xs text-slate-100 hover:bg-slate-700">Metadata</button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
