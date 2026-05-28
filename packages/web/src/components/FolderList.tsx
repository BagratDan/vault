import React from "react";

export interface FolderRow {
  folderId: string;
  displayName: string;
  visibility: "public" | "private";
  ownerPeerId: string;
  fileCount: number;
  createdAt: string;
}

export interface FolderListProps {
  folders: readonly FolderRow[];
  selfPeerId: string;
  onOpen: (folderId: string) => void;
  onAddClick: () => void;
}

export function FolderList({ folders, selfPeerId, onOpen, onAddClick }: FolderListProps) {
  const own = folders.filter((f) => f.ownerPeerId === selfPeerId);
  const others = folders.filter((f) => f.ownerPeerId !== selfPeerId);
  return (
    <section className="rounded-2xl bg-slate-900 p-5 shadow">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Folders
        </h2>
        <button
          type="button"
          onClick={onAddClick}
          className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-cyan-400"
        >
          + Add folder
        </button>
      </div>
      {folders.length === 0 ? (
        <p className="text-xs text-slate-500">
          No folders yet. Click "+ Add folder" to point Vault at a directory on
          your disk — every PDF, DOCX, text, Markdown, and audio file inside is
          parsed and indexed locally. Folders default to private; flip to
          public to let admitted peers search them.
        </p>
      ) : (
        <>
          {own.length > 0 && (
            <ul className="space-y-2">
              {own.map((f) => (
                <FolderRowItem key={f.folderId} f={f} onOpen={onOpen} mineLabel />
              ))}
            </ul>
          )}
          {others.length > 0 && (
            <>
              <h3 className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Shared with you
              </h3>
              <ul className="space-y-2">
                {others.map((f) => (
                  <FolderRowItem key={f.folderId} f={f} onOpen={onOpen} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

interface RowProps {
  f: FolderRow;
  onOpen: (folderId: string) => void;
  mineLabel?: boolean;
}
function FolderRowItem({ f, onOpen, mineLabel }: RowProps) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(f.folderId)}
        className="flex w-full items-center justify-between rounded-xl bg-slate-800 p-3 text-left ring-1 ring-slate-800/60 hover:bg-slate-700"
      >
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-100">
            <span aria-hidden>📁</span>
            <span className="font-medium">{f.displayName}</span>
            {mineLabel && <span className="text-xs text-slate-500">(you)</span>}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            {f.fileCount} {f.fileCount === 1 ? "file" : "files"} ·{" "}
            <span className={f.visibility === "public" ? "text-cyan-300" : "text-slate-400"}>
              {f.visibility}
            </span>
          </div>
        </div>
        <span className="text-xs text-slate-500">{new Date(f.createdAt).toLocaleDateString()}</span>
      </button>
    </li>
  );
}
