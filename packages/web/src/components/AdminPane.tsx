import React, { useState } from "react";

export interface AdminMember {
  peerId: string;
  displayName: string;
  role: "admin" | "member";
  admittedAt?: string;
  revoked?: { at: string; reason?: string };
}

export interface AdminPaneProps {
  members: readonly AdminMember[];
  selfPeerId: string;
  onRevoke: (targetPeerId: string, reason?: string) => void;
  onViewAccess: (targetPeerId: string) => void;
  onClose: () => void;
}

export function AdminPane({
  members,
  selfPeerId,
  onRevoke,
  onViewAccess,
  onClose,
}: AdminPaneProps) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Admin</h1>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          ← back
        </button>
      </header>
      <ul className="space-y-2">
        {members.map((m) => {
          const isSelf = m.peerId === selfPeerId;
          return (
            <li
              key={m.peerId}
              className="rounded-xl bg-slate-900 p-3 shadow ring-1 ring-slate-800"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-100">
                    {m.displayName}
                    {isSelf && (
                      <span className="ml-2 text-xs text-slate-500">(you)</span>
                    )}
                    {m.revoked && (
                      <span className="ml-2 rounded-full bg-rose-950 px-2 py-0.5 text-xs text-rose-300">
                        revoked
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-xs text-slate-500">
                    {m.peerId.slice(0, 16)}… ·{" "}
                    <span className="text-slate-400">{m.role}</span>
                    {m.admittedAt && (
                      <span>
                        {" "}
                        · admitted {new Date(m.admittedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onViewAccess(m.peerId)}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
                  >
                    View access
                  </button>
                  {!isSelf && !m.revoked && (
                    <button
                      type="button"
                      onClick={() => setConfirming(m.peerId)}
                      className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-600"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
              {confirming === m.peerId && (
                <div className="mt-3 rounded-lg bg-slate-800 p-3">
                  <p className="text-xs text-slate-300">
                    Confirm revoking {m.displayName}. They will no longer be
                    able to write to the vault.
                  </p>
                  <input
                    type="text"
                    placeholder="Optional reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-1.5 text-xs"
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onRevoke(m.peerId, reason || undefined);
                        setConfirming(null);
                        setReason("");
                      }}
                      className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500"
                    >
                      Confirm revoke
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirming(null);
                        setReason("");
                      }}
                      className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
