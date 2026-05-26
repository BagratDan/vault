import React, { useState } from "react";

export interface InviteTokenDisplayProps {
  token: string;
  expiresAt: string;
  onDismiss: () => void;
}

export function InviteTokenDisplay({ token, expiresAt, onDismiss }: InviteTokenDisplayProps) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6">
      <div className="w-full max-w-2xl rounded-2xl bg-slate-900 p-6 ring-1 ring-slate-800">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Invite token</h2>
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            ✕
          </button>
        </div>
        <p className="mb-3 text-sm text-slate-400">
          Share this token out-of-band (Signal, email, in-person). It expires{" "}
          {new Date(expiresAt).toLocaleString()}.
        </p>
        <textarea
          readOnly
          value={token}
          rows={4}
          className="w-full resize-none rounded-xl bg-slate-800 p-3 font-mono text-xs text-slate-200 focus:outline-none"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(token);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              // Clipboard API unavailable (non-secure context, denied permissions).
              // User can still select the textarea and copy manually.
            }
          }}
          className="mt-3 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-cyan-400"
        >
          {copied ? "Copied!" : "Copy to clipboard"}
        </button>
      </div>
    </div>
  );
}
