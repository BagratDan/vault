import React, { useState } from "react";

export interface AddFolderDialogProps {
  onSubmit: (path: string, displayName: string, visibility: "public" | "private") => void;
  onCancel: () => void;
}

export function AddFolderDialog({ onSubmit, onCancel }: AddFolderDialogProps) {
  const [path, setPath] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!path.trim() || !displayName.trim()) return;
    onSubmit(path.trim(), displayName.trim(), visibility);
  }

  function handlePathChange(v: string) {
    setPath(v);
    if (!displayName) {
      const base = v.split("/").filter(Boolean).pop();
      if (base) setDisplayName(base);
    }
  }

  return (
    <div role="dialog" aria-labelledby="add-folder-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-lg rounded-2xl bg-slate-900 p-6 ring-1 ring-slate-800">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="add-folder-title" className="text-lg font-semibold text-slate-100">Add folder</h2>
          <button type="button" onClick={onCancel} aria-label="Close" className="text-xs text-slate-400 hover:text-slate-200">✕</button>
        </div>
        <label className="block">
          <span className="text-xs text-slate-400">Absolute path on your disk</span>
          <input type="text" value={path} onChange={(e) => handlePathChange(e.target.value)} placeholder="/Users/sarah/Documents/Acme" className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 font-mono text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </label>
        <label className="mt-3 block">
          <span className="text-xs text-slate-400">Display name</span>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Acme MSA" className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </label>
        <fieldset className="mt-3">
          <legend className="text-xs text-slate-400">Visibility</legend>
          <div className="mt-1 flex gap-4 text-sm text-slate-200">
            <label className="flex items-center gap-1">
              <input type="radio" name="visibility" value="private" checked={visibility === "private"} onChange={() => setVisibility("private")} className="accent-cyan-500" />
              Private (local only)
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="visibility" value="public" checked={visibility === "public"} onChange={() => setVisibility("public")} className="accent-cyan-500" />
              Public (admitted peers can search)
            </label>
          </div>
        </fieldset>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-600">Cancel</button>
          <button type="submit" className="rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-cyan-400">Add folder</button>
        </div>
      </form>
    </div>
  );
}
