import React, { useEffect, useRef, useState } from "react";

export interface IncomingRequest {
  consentRequestId: string;
  requesterDisplayName: string;
  memoryId: string;
  memoryTitle: string;
  scope: "metadata" | "snippet" | "file";
  ratePolicy?: "normal" | "warned" | "paused";
  expiresAt: number;
}

export interface ConsentToastProps {
  request: IncomingRequest;
  onRespond: (
    consentRequestId: string,
    decision: "approve-snippet" | "approve-file" | "approve-metadata" | "deny"
  ) => void;
}

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function ConsentToast({ request, onRespond }: ConsentToastProps) {
  const [now, setNow] = useState(Date.now());
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onRespond(request.consentRequestId, "deny");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request.consentRequestId, onRespond]);
  const remaining = request.expiresAt - now;
  return (
    <div
      ref={rootRef}
      role="alertdialog"
      aria-labelledby={`toast-${request.consentRequestId}-title`}
      className="w-80 rounded-2xl bg-slate-900 p-4 shadow-xl ring-1 ring-slate-800"
    >
      {request.ratePolicy === "warned" && (
        <div className="mb-3 rounded-xl bg-amber-950 px-3 py-2 text-xs text-amber-200 ring-1 ring-amber-900">
          You've approved several from {request.requesterDisplayName} in the last 10 minutes. Pause?
        </div>
      )}
      <h3 id={`toast-${request.consentRequestId}-title`} className="text-sm font-semibold text-slate-100">
        {request.requesterDisplayName} wants {request.scope} from
      </h3>
      <p className="mt-1 truncate text-sm text-slate-300">{request.memoryTitle}</p>
      <p className="mt-1 font-mono text-xs text-slate-500">Expires in {formatRemaining(remaining)}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => onRespond(request.consentRequestId, "approve-snippet")} className="flex-1 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-cyan-400">Snippet</button>
        <button type="button" onClick={() => onRespond(request.consentRequestId, "approve-file")} className="flex-1 rounded-lg bg-cyan-700 px-3 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-600">Full file</button>
        <button type="button" onClick={() => onRespond(request.consentRequestId, "deny")} className="flex-1 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-600">Deny</button>
      </div>
      <button type="button" onClick={() => onRespond(request.consentRequestId, "approve-metadata")} className="mt-2 w-full rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700">Metadata only</button>
    </div>
  );
}
