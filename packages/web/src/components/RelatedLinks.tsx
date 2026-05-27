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
  if (edges.length === 0) return <p className="text-sm opacity-70">No related records.</p>;
  const groups = new Map<string, RelatedEdge[]>();
  for (const e of edges) {
    const g = groups.get(e.type) ?? [];
    g.push(e);
    groups.set(e.type, g);
  }
  return (
    <div className="flex flex-col gap-2">
      {[...groups.entries()].map(([type, list]) => (
        <div key={type}>
          <span className="text-xs uppercase opacity-60">{TYPE_LABELS[type] ?? type}</span>
          <div className="flex flex-wrap gap-2">
            {list.map((e) => (
              <button key={e.relId} type="button" className="underline" onClick={() => onOpen(e.otherId)}>{e.otherLabel}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
