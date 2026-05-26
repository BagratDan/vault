import React, { useState } from "react";

export interface Peer {
  peerId: string;
  displayName: string;
  role: "admin" | "member";
}

export interface PeerListProps {
  peers: readonly Peer[];
  selfPeerId: string;
  onCreateInvite?: () => void;
}

export function PeerList({ peers, selfPeerId, onCreateInvite }: PeerListProps) {
  const [open, setOpen] = useState(false);
  const selfIsAdmin = peers.find((p) => p.peerId === selfPeerId)?.role === "admin";
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
      >
        {peers.length} {peers.length === 1 ? "peer" : "peers"}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-xl bg-slate-900 p-3 shadow-lg ring-1 ring-slate-800">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Roster
          </h3>
          <ul className="space-y-2">
            {peers.map((p) => (
              <li
                key={p.peerId}
                className="flex items-center justify-between rounded-lg bg-slate-800 px-3 py-2"
              >
                <div>
                  <div className="text-sm text-slate-100">{p.displayName}</div>
                  <div className="font-mono text-xs text-slate-500">
                    {p.peerId.slice(0, 8)}
                    {p.peerId === selfPeerId ? " (you)" : ""}
                  </div>
                </div>
                <span
                  className={
                    p.role === "admin"
                      ? "rounded-full bg-cyan-950 px-2 py-0.5 text-xs text-cyan-300"
                      : "rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300"
                  }
                >
                  {p.role}
                </span>
              </li>
            ))}
          </ul>
          {selfIsAdmin && onCreateInvite && (
            <button
              type="button"
              onClick={onCreateInvite}
              className="mt-3 w-full rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-cyan-400"
            >
              Create invite
            </button>
          )}
        </div>
      )}
    </div>
  );
}
