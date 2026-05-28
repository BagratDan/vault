import { useEffect, useState } from "react";

export type Route =
  | "ask"
  | "library"
  | "people"
  | "places"
  | "events"
  | "tasks"
  | "folders"
  | "audit"
  | "admin";

const PATH_TO_ROUTE: Record<string, Route> = {
  "": "ask",
  "ask": "ask",
  "/ask": "ask",
  "library": "library",
  "/library": "library",
  "people": "people",
  "/people": "people",
  "places": "places",
  "/places": "places",
  "events": "events",
  "/events": "events",
  "tasks": "tasks",
  "/tasks": "tasks",
  "folders": "folders",
  "/folders": "folders",
  "audit": "audit",
  "/audit": "audit",
  "admin": "admin",
  "/admin": "admin",
};

function parseHash(): Route {
  if (typeof window === "undefined") return "ask";
  const h = window.location.hash.replace(/^#/, "");
  return PATH_TO_ROUTE[h] ?? "ask";
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
  window.location.hash = to === "ask" ? "" : `/${to}`;
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

export type RecordKind = "person" | "place" | "event" | "task" | "memory";

/** Returns {kind,id} when the hash is #/record/<kind>/<ulid>, else null. */
export function useRecordRoute(): { kind: RecordKind; id: string } | null {
  const [record, setRecord] = useState<{ kind: RecordKind; id: string } | null>(
    parseRecordHash()
  );
  useEffect(() => {
    function onChange() {
      setRecord(parseRecordHash());
    }
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return record;
}

function parseRecordHash(): { kind: RecordKind; id: string } | null {
  if (typeof window === "undefined") return null;
  const h = window.location.hash.replace(/^#/, "");
  const m = /^\/?record\/(person|place|event|task|memory)\/([0-9A-HJKMNP-TV-Z]{26})$/i.exec(h);
  return m ? { kind: m[1]!.toLowerCase() as RecordKind, id: m[2]! } : null;
}

export function navigateRecord(kind: RecordKind, id: string): void {
  if (typeof window === "undefined") return;
  window.location.hash = `/record/${kind}/${id}`;
}
