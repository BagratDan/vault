import React from "react";

export interface Citation {
  memoryId: string;
  ownerPeerId?: string;
}

export interface AnswerCardProps {
  text: string;
  citations: readonly Citation[];
  onPlay: (text: string) => void;
  playing?: boolean;
}

export function AnswerCard({ text, citations, onPlay, playing }: AnswerCardProps) {
  return (
    <article className="rounded-2xl bg-slate-900 p-5 shadow-lg ring-1 ring-cyan-900/40">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-cyan-400">
          Answer
        </h2>
        <button
          type="button"
          onClick={() => onPlay(text)}
          disabled={playing}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-50"
        >
          {playing ? "Playing…" : "Play"}
        </button>
      </div>
      <p className="text-sm leading-relaxed text-slate-100">{text}</p>
      {citations.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {citations.map((c) => (
            <span
              key={c.memoryId}
              className="rounded-full bg-cyan-950 px-2 py-0.5 font-mono text-xs text-cyan-300"
              title={c.ownerPeerId ?? "local"}
            >
              [{c.memoryId.slice(0, 6)}]
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
