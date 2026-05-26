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

/** Returns the folderId when the hash is #/folder/<ulid>, else null. */
export function useFolderRoute(): string | null {
  const [folderId, setFolderId] = useState<string | null>(parseFolderHash());
  useEffect(() => {
    function onChange() {
      setFolderId(parseFolderHash());
    }
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return folderId;
}

function parseFolderHash(): string | null {
  if (typeof window === "undefined") return null;
  const h = window.location.hash.replace(/^#/, "");
  const m = /^\/?folder\/([0-9A-HJKMNP-TV-Z]{26})$/i.exec(h);
  return m ? m[1]! : null;
}

export function navigateFolder(folderId: string): void {
  if (typeof window === "undefined") return;
  window.location.hash = `/folder/${folderId}`;
}
