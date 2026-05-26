import React from "react";

export interface AuditEvent {
  id: string;
  createdAt: string;
  requesterPeerId: string;
  ownerPeerId: string;
  resourceId: string;
  kind:
    | "request"
    | "approve-metadata"
    | "approve-snippet"
    | "approve-file"
    | "deny"
    | "expire";
  byteCount?: number;
  payloadHash?: string;
}

export interface AuditScreenProps {
  events: readonly AuditEvent[];
  selfPeerId: string;
  filter: { peerId?: string; kind?: string };
  onFilterChange: (next: { peerId?: string; kind?: string }) => void;
  onClose: () => void;
}

const KIND_LABELS: Record<AuditEvent["kind"], string> = {
  request: "requested",
  "approve-metadata": "approved (metadata)",
  "approve-snippet": "approved (snippet)",
  "approve-file": "approved (file)",
  deny: "denied",
  expire: "expired",
};

const KIND_COLORS: Record<AuditEvent["kind"], string> = {
  request: "text-slate-400",
  "approve-metadata": "text-emerald-300",
  "approve-snippet": "text-emerald-300",
  "approve-file": "text-emerald-300",
  deny: "text-rose-300",
  expire: "text-amber-300",
};

export function AuditScreen({
  events,
  selfPeerId,
  filter,
  onFilterChange,
  onClose,
}: AuditScreenProps) {
  const totalBytes = events.reduce((sum, e) => sum + (e.byteCount ?? 0), 0);
  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Audit log</h1>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          ← back
        </button>
      </header>
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          placeholder="Filter by peerId…"
          value={filter.peerId ?? ""}
          onChange={(e) =>
            onFilterChange({
              ...filter,
              peerId: e.target.value || undefined,
            })
          }
          className="flex-1 rounded-xl bg-slate-800 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
        <select
          value={filter.kind ?? ""}
          onChange={(e) =>
            onFilterChange({
              ...filter,
              kind: e.target.value || undefined,
            })
          }
          className="rounded-xl bg-slate-800 px-3 py-1.5 text-xs"
        >
          <option value="">All kinds</option>
          {Object.keys(KIND_LABELS).map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k as AuditEvent["kind"]]}
            </option>
          ))}
        </select>
      </div>
      {filter.peerId && (
        <p className="mb-3 text-xs text-slate-400">
          Total revealed to peer{" "}
          <span className="font-mono">{filter.peerId.slice(0, 8)}</span>:{" "}
          <span className="text-slate-200">{totalBytes} bytes</span> across{" "}
          {events.length} event(s)
        </p>
      )}
      {events.length === 0 && (
        <p className="mt-4 rounded-xl bg-slate-900 p-4 text-xs text-slate-400 ring-1 ring-slate-800">
          No audit events yet. Events appear here when a peer requests one of your memories — or
          when you request access to one of theirs. Every request, approval, denial, and expiry
          is recorded on this peer's append-only log.
        </p>
      )}
      <ol className="space-y-2">
        {events.map((e) => {
          const peer =
            e.requesterPeerId === selfPeerId
              ? e.ownerPeerId
              : e.requesterPeerId;
          return (
            <li
              key={e.id}
              className="rounded-xl bg-slate-900 p-3 shadow ring-1 ring-slate-800"
            >
              <div className="flex items-baseline justify-between">
                <span className={`text-xs font-medium ${KIND_COLORS[e.kind]}`}>
                  {KIND_LABELS[e.kind]}
                </span>
                <span className="font-mono text-xs text-slate-500">
                  {new Date(e.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {e.requesterPeerId === selfPeerId ? "you →" : "←"}{" "}
                <span className="font-mono">{peer.slice(0, 8)}</span> ·{" "}
                <span className="font-mono">{e.resourceId.slice(0, 8)}</span>
                {e.byteCount !== undefined && (
                  <span> · {e.byteCount} bytes</span>
                )}
              </p>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
