import type { Route } from "../routes.js";

const ITEMS: { route: Route; label: string }[] = [
  { route: "ask", label: "Ask" },
  { route: "library", label: "Library" },
  { route: "people", label: "People" },
  { route: "places", label: "Places" },
  { route: "events", label: "Events" },
  { route: "tasks", label: "Tasks" },
  { route: "folders", label: "Folders" },
  { route: "audit", label: "Team" },
];

export function Sidebar({ current, onNavigate }: { current: Route; onNavigate: (r: Route) => void }) {
  return (
    <nav className="flex w-48 flex-col gap-1 border-r p-3" aria-label="Primary">
      {ITEMS.map((it) => (
        <a
          key={it.route}
          href="#"
          aria-current={current === it.route ? "page" : undefined}
          className={current === it.route ? "font-semibold" : ""}
          onClick={(e) => {
            e.preventDefault();
            onNavigate(it.route);
          }}
        >
          {it.label}
        </a>
      ))}
    </nav>
  );
}
