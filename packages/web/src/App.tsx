import React, { useEffect, useRef, useState } from "react";
import { createWsClient, type WsClient } from "./ws-client.js";
import { CapturePane } from "./components/CapturePane.js";
import { SearchBar } from "./components/SearchBar.js";
import { ResultCard } from "./components/ResultCard.js";
import { AnswerCard } from "./components/AnswerCard.js";
import { FilterControls, type Filters } from "./components/FilterControls.js";
import { ModelStatus } from "./components/ModelStatus.js";
import { VaultSetup } from "./components/VaultSetup.js";
import { PeerList, type Peer } from "./components/PeerList.js";
import { InviteTokenDisplay } from "./components/InviteTokenDisplay.js";
import { ToastQueue } from "./components/ToastQueue.js";
import type { IncomingRequest } from "./components/ConsentToast.js";
import { AuditScreen, type AuditEvent } from "./components/AuditScreen.js";
import { AdminPane, type AdminMember } from "./components/AdminPane.js";
import {
  useHashRoute,
  navigate,
  useFolderRoute,
  navigateFolder,
  useRecordRoute,
  navigateRecord,
  type RecordKind,
} from "./routes.js";
import { FolderList, type FolderRow } from "./components/FolderList.js";
import { AddFolderDialog } from "./components/AddFolderDialog.js";
import { FolderView } from "./components/FolderView.js";
import { Sidebar } from "./components/Sidebar.js";
import { EntityList } from "./components/EntityList.js";
import { RecordDetail } from "./components/RecordDetail.js";
import type { RelatedEdge } from "./components/RelatedLinks.js";
import type { Hit, Citation, ClientMessage, RelEdge } from "./types.js";

type EntityKind = "person" | "place" | "event" | "task";
type EntityRecord = Record<string, unknown>;

/** Safe string read from a record's index signature. */
function field(r: EntityRecord, key: string): string {
  const v = r[key];
  return typeof v === "string" ? v : "";
}

/** All entity records carry their ULID in the `id` field (see domain baseRecordShape). */
function entityId(r: EntityRecord): string {
  return field(r, "id");
}

/** Human label for an entity record by kind. */
function entityLabel(kind: EntityKind, r: EntityRecord): string {
  if (kind === "person") return field(r, "displayName") || entityId(r);
  if (kind === "place") return field(r, "name") || entityId(r);
  return field(r, "title") || entityId(r); // event | task
}

export function App() {
  const [ws, setWs] = useState<WsClient | null>(null);
  const [connState, setConnState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [vaultStateView, setVaultStateView] = useState<"unknown" | "no-vault" | "admin" | "member">(
    "unknown"
  );
  const [hits, setHits] = useState<Hit[]>([]);
  const [answer, setAnswer] = useState<{ text: string; citations: Citation[] } | null>(
    null
  );
  const [filters, setFilters] = useState<Filters>({});
  const [playing, setPlaying] = useState(false);
  const [banner, setBanner] = useState<
    | { kind: "info" | "success" | "error"; text: string }
    | null
  >(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [selfPeerId, setSelfPeerId] = useState<string>("");
  const [inviteToken, setInviteToken] = useState<{ token: string; expiresAt: string } | null>(
    null
  );
  const [toasts, setToasts] = useState<IncomingRequest[]>([]);
  const [granted, setGranted] = useState<Map<string, { scope: string; text: string }>>(new Map());
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditFilter, setAuditFilter] = useState<{ peerId?: string; kind?: string }>({});
  const [adminMembers, setAdminMembers] = useState<AdminMember[]>([]);
  const [library, setLibrary] = useState<Array<{
    memoryId: string;
    summary: string;
    body: string;
    tags: string[];
    createdAt: string;
    ownerPeerId: string;
    confidence: number;
    folderId: string;
  }>>([]);
  const route = useHashRoute();
  const folderRoute = useFolderRoute();
  const recordRoute = useRecordRoute();
  const [entities, setEntities] = useState<Record<EntityKind, EntityRecord[]>>({
    person: [],
    place: [],
    event: [],
    task: [],
  });
  const [detail, setDetail] = useState<
    | { kind: RecordKind; id: string; record: EntityRecord | null; from: RelEdge[]; to: RelEdge[] }
    | null
  >(null);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [folderProgress, setFolderProgress] = useState<
    Record<
      string,
      {
        current: number;
        total: number;
        phase: "scanning" | "extracting" | "embedding" | "done";
        currentFile?: string;
      }
    >
  >({});
  const toastsRef = useRef<IncomingRequest[]>([]);
  const pendingScopes = useRef<Array<"metadata" | "snippet" | "file">>([]);
  useEffect(() => {
    toastsRef.current = toasts;
  }, [toasts]);
  const audioQueue = useRef<{ queue: string[]; el: HTMLAudioElement | null }>({
    queue: [],
    el: null,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    setConnState("loading");
    (async () => {
      try {
        const res = await fetch("/token", { credentials: "omit" });
        if (!res.ok) throw new Error(`token endpoint returned ${res.status}`);
        const body = (await res.json()) as { token: string };
        if (cancelled) return;
        const client = createWsClient({
          url: `ws://${window.location.host}/ws?token=${encodeURIComponent(body.token)}`,
        });
        client.send({ kind: "vault.status" });
        setWs(client);
        setConnState("ready");
      } catch (err) {
        console.error("[vault] sidecar handshake failed:", err);
        if (!cancelled) setConnState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ws) return;
    if (!audioQueue.current.el) {
      const el = new Audio();
      // Play the next queued blob URL when the current one finishes,
      // revoking the URL we just played to avoid blob leaks.
      el.addEventListener("ended", () => {
        const finishedUrl = el.src;
        if (finishedUrl.startsWith("blob:")) URL.revokeObjectURL(finishedUrl);
        const next = audioQueue.current.queue.shift();
        if (next) {
          el.src = next;
          void el.play();
        }
      });
      audioQueue.current.el = el;
    }
    const unsubscribe = ws.onMessage((m) => {
      if (m.kind === "vault.status") {
        setVaultStateView(m.state);
        if (m.selfPeerId) setSelfPeerId(m.selfPeerId);
        if (m.state === "admin" || m.state === "member") {
          ws.send({ kind: "peer.list" });
          ws.send({ kind: "memory.list" });
          ws.send({ kind: "folder.list" });
        }
      } else if (m.kind === "vault.created" || m.kind === "vault.joined") {
        ws.send({ kind: "vault.status" });
        ws.send({ kind: "peer.list" });
        ws.send({ kind: "memory.list" });
      } else if (m.kind === "memory.list") {
        setLibrary(m.memories);
      } else if (m.kind === "entity.results") {
        setEntities((prev) => ({ ...prev, [m.entityKind]: m.items }));
      } else if (m.kind === "entity.detail") {
        setDetail((prev) =>
          prev && prev.kind === m.entityKind
            ? { ...prev, record: m.record, from: m.from, to: m.to }
            : prev
        );
      } else if (m.kind === "relationship.results") {
        setDetail((prev) =>
          prev && prev.id === m.recordId
            ? { ...prev, from: m.from, to: m.to }
            : prev
        );
      } else if (m.kind === "peer.list") {
        setPeers(m.peers);
      } else if (m.kind === "peer.connected") {
        setPeers((prev) =>
          prev.some((p) => p.peerId === m.peer.peerId)
            ? prev
            : [...prev, { ...m.peer, role: "member" }]
        );
      } else if (m.kind === "peer.disconnected") {
        setPeers((prev) => prev.filter((p) => p.peerId !== m.peerId));
      } else if (m.kind === "folder.list") {
        setFolders(m.folders);
      } else if (m.kind === "folder.added") {
        ws.send({ kind: "folder.list" });
        ws.send({ kind: "memory.list" });
      } else if (m.kind === "folder.ingest-progress") {
        setFolderProgress((p) => ({
          ...p,
          [m.folderId]: {
            current: m.current,
            total: m.total,
            phase: m.phase,
            ...(m.currentFile ? { currentFile: m.currentFile } : {}),
          },
        }));
      } else if (m.kind === "folder.ingest-done") {
        const done = m.ingested + m.skipped + m.errors;
        setFolderProgress((p) => ({
          ...p,
          [m.folderId]: { current: done, total: done, phase: "done" },
        }));
        ws.send({ kind: "folder.list" });
        ws.send({ kind: "memory.list" });
      } else if (m.kind === "folder.updated") {
        ws.send({ kind: "folder.list" });
      } else if (m.kind === "folder.deleted") {
        ws.send({ kind: "folder.list" });
        ws.send({ kind: "memory.list" });
      } else if (m.kind === "invite.token") {
        setInviteToken({ token: m.token, expiresAt: m.expiresAt });
      } else if (m.kind === "search.hits") {
        setHits(m.hits);
      } else if (m.kind === "capture.ack") {
        setBanner(
          m.duplicateOf
            ? { kind: "info", text: `Duplicate of memory ${m.duplicateOf.slice(0, 8)}` }
            : { kind: "success", text: `Saved memory ${m.memoryId.slice(0, 8)}` }
        );
        if (!m.duplicateOf && pendingScopes.current.length > 0) {
          ws.send({
            kind: "memory.update-scopes",
            memoryId: m.memoryId,
            requestableScopes: pendingScopes.current,
          });
          pendingScopes.current = [];
        }
        // Refresh library list so the new memory appears in the home view.
        ws.send({ kind: "memory.list" });
      } else if (m.kind === "error") {
        const short = m.message.length > 240 ? m.message.slice(0, 240) + "…" : m.message;
        setBanner({ kind: "error", text: `${m.code}: ${short}` });
      } else if (m.kind === "consent.incoming") {
        setToasts((prev) =>
          prev.some((t) => t.consentRequestId === m.consentRequestId)
            ? prev
            : [
                ...prev,
                {
                  consentRequestId: m.consentRequestId,
                  requesterDisplayName: m.requesterDisplayName,
                  memoryId: m.memoryId,
                  memoryTitle: m.memoryTitle,
                  scope: m.scope,
                  expiresAt: m.expiresAt,
                  ...(m.ratePolicy ? { ratePolicy: m.ratePolicy } : {}),
                },
              ]
        );
      } else if (m.kind === "consent.granted") {
        let text = "";
        if (m.scope === "snippet" && m.payload && typeof m.payload === "object" && "text" in m.payload) {
          text = String((m.payload as { text: string }).text);
        } else if (m.scope === "metadata" && m.payload && typeof m.payload === "object") {
          text = JSON.stringify(m.payload);
        } else if (m.scope === "file" && m.payload && typeof m.payload === "object" && "contentBase64" in m.payload) {
          try {
            text = atob(String((m.payload as { contentBase64: string }).contentBase64));
          } catch {
            text = "[binary]";
          }
        }
        setHits((prev) => {
          const updated = [...prev];
          const t = toastsRef.current.find((x) => x.consentRequestId === m.consentRequestId);
          if (!t) return updated;
          const idx = updated.findIndex((h) => h.memoryId === t.memoryId);
          if (idx >= 0) updated[idx] = { ...updated[idx]!, snippet: text };
          return updated;
        });
        setGranted((prev) => {
          const next = new Map(prev);
          const t = toastsRef.current.find((x) => x.consentRequestId === m.consentRequestId);
          if (t) next.set(t.memoryId, { scope: m.scope, text });
          return next;
        });
        setToasts((prev) => prev.filter((t) => t.consentRequestId !== m.consentRequestId));
      } else if (m.kind === "consent.denied" || m.kind === "consent.expired") {
        setToasts((prev) => prev.filter((t) => t.consentRequestId !== m.consentRequestId));
        if (m.kind === "consent.denied") {
          setBanner({ kind: "error", text: `Access denied${m.reason ? ` (${m.reason})` : ""}.` });
        } else {
          setBanner({ kind: "info", text: `Request expired${m.reason ? ` (${m.reason})` : ""}.` });
        }
      } else if (m.kind === "consent.pending") {
        // Soft ack — no UI action needed.
      } else if (m.kind === "audit.events") {
        setAuditEvents(m.events as AuditEvent[]);
      } else if (m.kind === "admin.member-list") {
        setAdminMembers(m.members);
      } else if (m.kind === "admin.revoke-ack") {
        setBanner({ kind: "success", text: `Revoked ${m.targetPeerId.slice(0, 8)}…` });
        ws.send({ kind: "admin.member-list" });
      } else if (m.kind === "answer.chunk") {
        setAnswer({ text: m.text, citations: [] });
      } else if (m.kind === "answer.done") {
        setAnswer((prev) => (prev ? { ...prev, citations: m.citations } : null));
      } else if (m.kind === "tts.chunk") {
        const bytes = Uint8Array.from(atob(m.audioBase64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        const el = audioQueue.current.el!;
        if (el.paused && !el.src.startsWith("blob:")) {
          el.src = url;
          void el.play();
        } else {
          audioQueue.current.queue.push(url);
        }
      } else if (m.kind === "tts.done") {
        setPlaying(false);
      }
    });
    return unsubscribe;
  }, [ws]);

  const send = (msg: ClientMessage) => ws?.send(msg);

  useEffect(() => {
    if (route === "audit" && ws) {
      ws.send({ kind: "audit.query" });
    }
  }, [route, ws]);

  useEffect(() => {
    if (route === "admin" && ws && vaultStateView === "admin") {
      ws.send({ kind: "admin.member-list" });
    }
  }, [route, ws, vaultStateView]);

  // Load the entity list when entering a People/Places/Events/Tasks route.
  useEffect(() => {
    if (!ws) return;
    const entityKind: EntityKind | null =
      route === "people"
        ? "person"
        : route === "places"
          ? "place"
          : route === "events"
            ? "event"
            : route === "tasks"
              ? "task"
              : null;
    if (entityKind) ws.send({ kind: "entity.list", entityKind });
  }, [route, ws]);

  // Load a record's detail + relationships when entering a record-detail route.
  useEffect(() => {
    if (!ws || !recordRoute) {
      setDetail(null);
      return;
    }
    setDetail({ kind: recordRoute.kind, id: recordRoute.id, record: null, from: [], to: [] });
    if (recordRoute.kind === "memory") {
      // The memory body/summary already lives in `library`; only edges are remote.
      ws.send({ kind: "relationship.list", recordId: recordRoute.id });
    } else {
      ws.send({ kind: "entity.get", entityKind: recordRoute.kind, id: recordRoute.id });
    }
  }, [recordRoute?.kind, recordRoute?.id, ws]);

  if (connState !== "ready") {
    return (
      <main className="mx-auto flex max-w-3xl flex-col items-center justify-center p-10">
        <ModelStatus state={connState} />
      </main>
    );
  }

  if (vaultStateView === "unknown") {
    return (
      <main className="mx-auto flex max-w-3xl flex-col items-center justify-center p-10">
        <p className="text-sm text-slate-400">Loading vault status…</p>
      </main>
    );
  }

  if (vaultStateView === "no-vault") {
    return (
      <VaultSetup
        onCreate={(displayName) => send({ kind: "vault.create", displayName })}
        onJoin={(token, displayName) => send({ kind: "vault.invite-accept", token, displayName })}
      />
    );
  }

  // Resolve a record id to a human label + its kind, using everything loaded so
  // far (entity lists + library). Falls back to the bare id / "memory" kind.
  const labelOf = (id: string): { label: string; kind: RecordKind } => {
    for (const k of ["person", "place", "event", "task"] as const) {
      const r = entities[k].find((e) => entityId(e) === id);
      if (r) return { label: entityLabel(k, r), kind: k };
    }
    const mem = library.find((m) => m.memoryId === id);
    if (mem) return { label: mem.summary || id, kind: "memory" };
    return { label: id, kind: "memory" };
  };

  // Map server relationship edges (from carry toId, to carry fromId) to the
  // RelatedLinks shape, resolving the "other" record's label.
  const edgesToRelated = (from: RelEdge[], to: RelEdge[]): RelatedEdge[] => {
    const out: RelatedEdge[] = [];
    for (const e of from) {
      const otherId = e.toId ?? "";
      out.push({ relId: e.relId, otherId, otherLabel: labelOf(otherId).label, type: e.type });
    }
    for (const e of to) {
      const otherId = e.fromId ?? "";
      out.push({ relId: e.relId, otherId, otherLabel: labelOf(otherId).label, type: e.type });
    }
    return out;
  };

  const openRecord = (id: string) => {
    const { kind } = labelOf(id);
    navigateRecord(kind, id);
  };

  let content: React.ReactNode = null;

  if (folderRoute) {
    const f = folders.find((x) => x.folderId === folderRoute);
    if (!f) {
      content = (
        <main className="mx-auto max-w-3xl p-6">
          <p className="text-sm text-slate-400">Loading folder…</p>
          <button
            type="button"
            onClick={() => navigate("ask")}
            className="mt-2 text-xs text-slate-400 hover:text-slate-200"
          >
            ← folders
          </button>
        </main>
      );
    } else {
    const folderFiles = library
      .filter((m) => m.folderId === folderRoute)
      .map((m) => ({
        memoryId: m.memoryId,
        summary: m.summary,
        createdAt: m.createdAt,
        tags: m.tags,
      }));
    const isOwner = f.ownerPeerId === selfPeerId;
    content = (
      <FolderView
        folder={{
          folderId: f.folderId,
          displayName: f.displayName,
          visibility: f.visibility,
          ownerPeerId: f.ownerPeerId,
          fileCount: f.fileCount,
          ...("path" in f && (f as { path?: string }).path
            ? { path: (f as { path?: string }).path }
            : {}),
        }}
        isOwner={isOwner}
        files={folderFiles}
        ingestProgress={folderProgress[folderRoute] ?? null}
        onBack={() => navigate("folders")}
        onRescan={() => send({ kind: "folder.rescan", folderId: folderRoute })}
        onToggleVisibility={(next) =>
          send({ kind: "folder.update", folderId: folderRoute, visibility: next })
        }
        onDelete={() => {
          if (
            window.confirm(
              "Delete this folder from the vault? The files on your disk are NOT touched."
            )
          ) {
            send({ kind: "folder.delete", folderId: folderRoute });
            navigate("folders");
          }
        }}
      >
        <CapturePane
          onSubmitText={(text, tags, scopes) => {
            send({ kind: "capture.text", text, tags });
            pendingScopes.current = scopes;
          }}
          onSubmitAudio={(audio, tags, scopes) => {
            let bin = "";
            for (let i = 0; i < audio.length; i++) bin += String.fromCharCode(audio[i]!);
            const audioBase64 = btoa(bin);
            send({ kind: "capture.audio", audioBase64, tags });
            pendingScopes.current = scopes;
          }}
        />
        <section className="rounded-2xl bg-slate-900 p-5 shadow">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
            Ask (this folder)
          </h2>
          <SearchBar
            onSubmit={(query) => {
              setAnswer(null);
              send({ kind: "search.run", query, k: 8, folderIds: [folderRoute] });
            }}
          />
          {answer && (
            <div className="mt-4">
              <AnswerCard
                text={answer.text}
                citations={answer.citations}
                playing={playing}
                onPlay={(text) => {
                  setPlaying(true);
                  send({ kind: "tts.play", text, requestId: `tts-${Date.now()}` });
                }}
              />
            </div>
          )}
          {hits.length > 0 && (
            <div className="mt-4 space-y-3">
              {hits.map((h) => {
                const ownerName = peers.find((p) => p.peerId === h.ownerPeerId)?.displayName;
                const grant = granted.get(h.memoryId);
                return (
                  <ResultCard
                    key={h.memoryId}
                    memoryId={h.memoryId}
                    score={h.score}
                    snippet={grant ? grant.text : h.snippet}
                    tags={h.tags}
                    {...(h.ownerPeerId ? { ownerPeerId: h.ownerPeerId } : {})}
                    {...(ownerName ? { ownerDisplayName: ownerName } : {})}
                    fullContentAvailable={!!grant}
                    {...(h.ownerPeerId && h.ownerPeerId !== selfPeerId
                      ? {
                          onRequestAccess: (scope: "metadata" | "snippet" | "file") =>
                            send({
                              kind: "consent.request",
                              memoryId: h.memoryId,
                              ownerPeerId: h.ownerPeerId!,
                              scope,
                            }),
                        }
                      : {})}
                  />
                );
              })}
            </div>
          )}
        </section>
      </FolderView>
    );
    }
  } else if (recordRoute) {
    content = renderRecordDetail();
  } else if (route === "audit") {
    content = (
      <AuditScreen
        events={auditEvents.filter(
          (e) => !auditFilter.kind || e.kind === auditFilter.kind
        )}
        selfPeerId={selfPeerId}
        filter={auditFilter}
        onFilterChange={(next) => {
          setAuditFilter(next);
          send({ kind: "audit.query", ...(next.peerId ? { peerId: next.peerId } : {}) });
        }}
        onClose={() => navigate("ask")}
      />
    );
  } else if (route === "admin") {
    content =
      vaultStateView !== "admin" ? (
        <main className="mx-auto max-w-3xl p-6">
          <p className="text-sm text-rose-300">Admin only.</p>
          <button
            type="button"
            onClick={() => navigate("ask")}
            className="mt-2 text-xs text-slate-400 hover:text-slate-200"
          >
            ← back
          </button>
        </main>
      ) : (
        <AdminPane
          members={adminMembers}
          selfPeerId={selfPeerId}
          onRevoke={(targetPeerId, reason) => {
            const payload: { kind: "admin.revoke-member"; targetPeerId: string; reason?: string } = {
              kind: "admin.revoke-member",
              targetPeerId,
            };
            if (reason) payload.reason = reason;
            send(payload);
          }}
          onViewAccess={(targetPeerId) => {
            setAuditFilter({ peerId: targetPeerId });
            send({ kind: "audit.query", peerId: targetPeerId });
            navigate("audit");
          }}
          onClose={() => navigate("ask")}
        />
      );
  } else if (route === "folders") {
    content = (
      <main className="mx-auto max-w-3xl space-y-5 p-6">
        <RouteHeader />
        {addOpen && (
          <AddFolderDialog
            onCancel={() => setAddOpen(false)}
            onSubmit={(path, displayName, visibility) => {
              setAddOpen(false);
              send({ kind: "folder.add", path, displayName, visibility });
            }}
          />
        )}
        <FolderList
          folders={folders}
          selfPeerId={selfPeerId}
          onOpen={(folderId) => navigateFolder(folderId)}
          onAddClick={() => setAddOpen(true)}
        />
      </main>
    );
  } else if (
    route === "people" ||
    route === "places" ||
    route === "events" ||
    route === "tasks"
  ) {
    const kind: EntityKind =
      route === "people" ? "person" : route === "places" ? "place" : route === "events" ? "event" : "task";
    const items = entities[kind].map((r) => ({ id: entityId(r), label: entityLabel(kind, r) }));
    content = (
      <main className="mx-auto max-w-3xl space-y-5 p-6">
        <RouteHeader />
        <section className="rounded-2xl bg-slate-900 p-5 shadow">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
            {route}
          </h2>
          <EntityList kind={kind} items={items} onOpen={(id) => navigateRecord(kind, id)} />
        </section>
      </main>
    );
  } else if (route === "library") {
    content = (
      <main className="mx-auto max-w-3xl space-y-5 p-6">
        <RouteHeader />
        <section className="rounded-2xl bg-slate-900 p-5 shadow">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
            Library
          </h2>
          {library.length === 0 ? (
            <p className="text-sm text-slate-500">No memories yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {library.map((m) => (
                <li key={m.memoryId}>
                  <button
                    type="button"
                    className="text-left text-sm underline"
                    onClick={() => navigateRecord("memory", m.memoryId)}
                  >
                    {m.summary || m.memoryId}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    );
  } else {
    // route === "ask" — the cross-folder ask/search surface.
    content = (
      <main className="mx-auto max-w-3xl space-y-5 p-6">
        <RouteHeader />
        <section className="rounded-2xl bg-slate-900 p-5 shadow">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
            Ask (across all folders)
          </h2>
          <SearchBar
            onSubmit={(query) => {
              setAnswer(null);
              const msg: ClientMessage =
                Object.keys(filters).length > 0
                  ? { kind: "search.run", query, k: 8, filters }
                  : { kind: "search.run", query, k: 8 };
              send(msg);
            }}
          />
          <div className="mt-3">
            <FilterControls value={filters} onChange={setFilters} />
          </div>

          {answer && (
            <div className="mt-4">
              <AnswerCard
                text={answer.text}
                citations={answer.citations}
                playing={playing}
                onPlay={(text) => {
                  setPlaying(true);
                  send({
                    kind: "tts.play",
                    text,
                    requestId: `tts-${Date.now()}`,
                  });
                }}
              />
            </div>
          )}

          {hits.length > 0 && (
            <div className="mt-4 space-y-3">
              {hits.map((h) => {
                const ownerName = peers.find((p) => p.peerId === h.ownerPeerId)?.displayName;
                const grant = granted.get(h.memoryId);
                return (
                  <ResultCard
                    key={h.memoryId}
                    memoryId={h.memoryId}
                    score={h.score}
                    snippet={grant ? grant.text : h.snippet}
                    tags={h.tags}
                    {...(h.ownerPeerId ? { ownerPeerId: h.ownerPeerId } : {})}
                    {...(ownerName ? { ownerDisplayName: ownerName } : {})}
                    fullContentAvailable={!!grant}
                    {...(h.ownerPeerId && h.ownerPeerId !== selfPeerId
                      ? {
                          onRequestAccess: (scope: "metadata" | "snippet" | "file") =>
                            send({
                              kind: "consent.request",
                              memoryId: h.memoryId,
                              ownerPeerId: h.ownerPeerId!,
                              scope,
                            }),
                        }
                      : {})}
                  />
                );
              })}
            </div>
          )}

          {!answer && hits.length === 0 && (
            <p className="mt-4 text-xs text-slate-500">
              Open a folder to capture memories, then ask a question — your local LLM answers
              from your own notes plus anything peers have shared with you.
            </p>
          )}
        </section>
      </main>
    );
  }

  function RouteHeader() {
    return (
      <>
        <header className="flex flex-wrap items-center justify-between gap-y-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Vault</h1>
            <p className="text-xs text-slate-400">Local-first, consent-gated memory</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <PeerList
              peers={peers}
              selfPeerId={selfPeerId}
              onCreateInvite={() => send({ kind: "vault.invite-create" })}
            />
            <ModelStatus state={connState} />
          </div>
        </header>
        {inviteToken && (
          <InviteTokenDisplay
            token={inviteToken.token}
            expiresAt={inviteToken.expiresAt}
            onDismiss={() => setInviteToken(null)}
          />
        )}
        {banner && <Banner banner={banner} onDismiss={() => setBanner(null)} />}
      </>
    );
  }

  function renderRecordDetail(): React.ReactNode {
    if (!detail) {
      return (
        <main className="mx-auto max-w-3xl space-y-5 p-6">
          <RouteHeader />
          <p className="text-sm text-slate-400">Loading record…</p>
        </main>
      );
    }
    const { title, fields } = detailHeader(detail);
    const edges = edgesToRelated(detail.from, detail.to);
    return (
      <main className="mx-auto max-w-3xl space-y-5 p-6">
        <RouteHeader />
        <section className="rounded-2xl bg-slate-900 p-5 shadow">
          <button
            type="button"
            onClick={() => navigate("ask")}
            className="mb-3 text-xs text-slate-400 hover:text-slate-200"
          >
            ← back
          </button>
          <RecordDetail title={title} fields={fields} edges={edges} onOpen={openRecord} />
        </section>
      </main>
    );
  }

  // Build the title + field rows shown above the relationship links.
  function detailHeader(d: NonNullable<typeof detail>): {
    title: string;
    fields: { label: string; value: string }[];
  } {
    if (d.kind === "memory") {
      const mem = library.find((m) => m.memoryId === d.id);
      if (!mem) return { title: d.id, fields: [] };
      return {
        title: mem.summary || d.id,
        fields: [
          { label: "Created", value: mem.createdAt },
          ...(mem.tags.length > 0 ? [{ label: "Tags", value: mem.tags.join(", ") }] : []),
          { label: "Body", value: mem.body },
        ],
      };
    }
    const r = d.record;
    if (!r) return { title: d.id, fields: [] };
    const title = entityLabel(d.kind, r);
    const fields: { label: string; value: string }[] = [];
    const aliases = r["aliases"];
    if (d.kind === "person" && Array.isArray(aliases) && aliases.length > 0) {
      fields.push({ label: "Aliases", value: (aliases as unknown[]).map(String).join(", ") });
    }
    if (d.kind === "event") {
      if (field(r, "startsAt")) fields.push({ label: "Starts", value: field(r, "startsAt") });
      if (field(r, "endsAt")) fields.push({ label: "Ends", value: field(r, "endsAt") });
    }
    if (d.kind === "task") {
      if (field(r, "status")) fields.push({ label: "Status", value: field(r, "status") });
      if (field(r, "dueAt")) fields.push({ label: "Due", value: field(r, "dueAt") });
    }
    if (field(r, "createdAt")) fields.push({ label: "Created", value: field(r, "createdAt") });
    return { title, fields };
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar current={route} onNavigate={navigate} />
      <div className="flex-1">{content}</div>
      <ToastQueue
        toasts={toasts}
        onRespond={(consentRequestId, decision) =>
          send({ kind: "consent.respond", consentRequestId, decision })
        }
      />
    </div>
  );
}

interface BannerProps {
  banner: { kind: "info" | "success" | "error"; text: string };
  onDismiss: () => void;
}

function Banner({ banner, onDismiss }: BannerProps) {
  const className =
    "rounded-xl px-4 py-2 text-sm " +
    (banner.kind === "error"
      ? "bg-rose-950 text-rose-200 ring-1 ring-rose-900"
      : banner.kind === "success"
        ? "bg-emerald-950 text-emerald-200 ring-1 ring-emerald-900"
        : "bg-slate-800 text-slate-200 ring-1 ring-slate-700");
  const inner = (
    <div className="flex items-center justify-between gap-3">
      <span className="break-words">{banner.text}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="text-xs text-slate-400 hover:text-slate-200"
        aria-label="dismiss"
      >
        ✕
      </button>
    </div>
  );
  // Two static role branches so jsx-a11y/aria-role can resolve them.
  return banner.kind === "error" ? (
    <div role="alert" className={className}>
      {inner}
    </div>
  ) : (
    <div role="status" className={className}>
      {inner}
    </div>
  );
}
