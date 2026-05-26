import React from "react";

export interface ResultCardProps {
  memoryId: string;
  score: number;
  snippet: string;
  tags: readonly string[];
}

export function ResultCard({ memoryId, score, snippet, tags }: ResultCardProps) {
  return (
    <article className="rounded-xl bg-slate-900 p-4 shadow">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-mono text-xs text-slate-500">{memoryId.slice(0, 8)}</span>
        <span className="text-xs text-slate-400">{(score * 100).toFixed(0)}%</span>
      </div>
      <p className="text-sm text-slate-200">{snippet}</p>
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
