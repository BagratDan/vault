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
    <nav
      className="flex w-48 shrink-0 flex-col gap-1 border-r border-slate-800 p-3"
      aria-label="Primary"
    >
      {ITEMS.map((it) => {
        const active = current === it.route;
        return (
          <a
            key={it.route}
            href={it.route === "ask" ? "#" : `#/${it.route}`}
            aria-current={active ? "page" : undefined}
            className={
              "block rounded-md border-l-2 px-3 py-2 text-sm no-underline transition-colors duration-150 " +
              (active
                ? "border-l-[#14b8a6] bg-slate-800 font-semibold text-[#5eead4]"
                : "border-l-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-100")
            }
            onClick={(e) => {
              e.preventDefault();
              onNavigate(it.route);
            }}
          >
            {it.label}
          </a>
        );
      })}
    </nav>
  );
}
