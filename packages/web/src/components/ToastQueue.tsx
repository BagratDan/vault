import React from "react";
import { ConsentToast, type IncomingRequest } from "./ConsentToast.js";

export interface ToastQueueProps {
  toasts: readonly IncomingRequest[];
  onRespond: (
    consentRequestId: string,
    decision: "approve-snippet" | "approve-file" | "approve-metadata" | "deny"
  ) => void;
}

export function ToastQueue({ toasts, onRespond }: ToastQueueProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-3">
      {toasts.map((t) => (
        <div key={t.consentRequestId} className="pointer-events-auto">
          <ConsentToast request={t} onRespond={onRespond} />
        </div>
      ))}
    </div>
  );
}
