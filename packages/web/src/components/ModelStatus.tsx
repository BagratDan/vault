import React from "react";

export interface ModelStatusProps {
  state: "idle" | "loading" | "ready" | "error";
  message?: string;
}

export function ModelStatus({ state, message }: ModelStatusProps) {
  const dot = {
    idle: "bg-slate-500",
    loading: "bg-amber-400 animate-pulse",
    ready: "bg-emerald-400",
    error: "bg-rose-500",
  }[state];
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      <span>QVAC: {message ?? state}</span>
    </div>
  );
}
