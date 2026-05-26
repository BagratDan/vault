import { useEffect, useState } from "react";

export type Route = "home" | "audit" | "admin";

function parseHash(): Route {
  if (typeof window === "undefined") return "home";
  const h = window.location.hash.replace(/^#/, "");
  if (h === "/audit" || h === "audit") return "audit";
  if (h === "/admin" || h === "admin") return "admin";
  return "home";
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(parseHash());
  useEffect(() => {
    function onChange() {
      setRoute(parseHash());
    }
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function navigate(to: Route): void {
  if (typeof window === "undefined") return;
  window.location.hash = to === "home" ? "" : `/${to}`;
}
