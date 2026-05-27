export interface EntityListItem { id: string; label: string }

export function EntityList({
  kind,
  items,
  onOpen,
}: {
  kind: "person" | "place" | "event" | "task";
  items: EntityListItem[];
  onOpen: (id: string) => void;
}) {
  if (items.length === 0) return <p className="text-sm opacity-70">No {kind}s yet.</p>;
  return (
    <ul className="flex flex-col gap-1">
      {items.map((it) => (
        <li key={it.id}>
          <button type="button" className="text-left underline" onClick={() => onOpen(it.id)}>
            {it.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
