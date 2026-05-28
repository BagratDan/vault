export interface RelatedEdge { relId: string; otherId: string; otherLabel: string; type: string }

const TYPE_LABELS: Record<string, string> = {
  "mentions": "Mentions",
  "located-at": "Located at",
  "attended-by": "Attended by",
  "references": "References",
  "derived-from": "Derived from",
  "duplicate-of": "Duplicate of",
};

export function RelatedLinks({ edges, onOpen }: { edges: RelatedEdge[]; onOpen: (id: string) => void }) {
  if (edges.length === 0) {
    return <p className="text-sm text-slate-500">No related records.</p>;
  }
  const groups = new Map<string, RelatedEdge[]>();
  for (const e of edges) {
    const g = groups.get(e.type) ?? [];
    g.push(e);
    groups.set(e.type, g);
  }
  return (
    <div className="flex flex-col gap-3">
      {[...groups.entries()].map(([type, list]) => (
        <div key={type} className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            {TYPE_LABELS[type] ?? type}
          </span>
          <div className="flex flex-wrap gap-2">
            {list.map((e) => (
              <button
                key={e.relId}
                type="button"
                onClick={() => onOpen(e.otherId)}
                className="cursor-pointer rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-xs text-[#5eead4] transition-colors duration-150 hover:border-[#14b8a6] hover:bg-slate-800 hover:text-[#2dd4bf] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
              >
                {e.otherLabel}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
