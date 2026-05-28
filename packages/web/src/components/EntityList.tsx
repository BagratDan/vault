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
  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">No {kind}s yet.</p>
    );
  }
  return (
    <ul className="flex flex-col gap-1">
      {items.map((it) => (
        <li key={it.id}>
          <button
            type="button"
            onClick={() => onOpen(it.id)}
            className="block w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm text-slate-200 transition-colors duration-150 hover:bg-slate-800 hover:text-[#5eead4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
          >
            {it.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
