import React, { useState } from "react";

export interface VaultSetupProps {
  onCreate: (displayName: string) => void;
  onJoin: (token: string, displayName: string) => void;
}

export function VaultSetup({ onCreate, onJoin }: VaultSetupProps) {
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [displayName, setDisplayName] = useState("");
  const [token, setToken] = useState("");

  if (mode === "choose") {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 p-10">
        <h1 className="text-2xl font-semibold">Welcome to Vault</h1>
        <p className="text-sm text-slate-400">
          To start using Vault, create a new vault or paste an invite from your admin.
        </p>
        <button
          type="button"
          onClick={() => setMode("create")}
          className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-cyan-400"
        >
          Create new Vault
        </button>
        <button
          type="button"
          onClick={() => setMode("join")}
          className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-600"
        >
          Join existing Vault
        </button>
      </main>
    );
  }

  if (mode === "create") {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-3 p-10">
        <button
          type="button"
          onClick={() => setMode("choose")}
          className="self-start text-xs text-slate-400 hover:text-slate-200"
        >
          ← back
        </button>
        <h1 className="text-2xl font-semibold">Create a Vault</h1>
        <p className="text-sm text-slate-400">
          You'll be the admin. You can invite others later.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!displayName.trim()) return;
            onCreate(displayName.trim());
          }}
          className="flex flex-col gap-3"
        >
          <input
            type="text"
            placeholder="Vault name (e.g. Acme Legal)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          <button
            type="submit"
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-cyan-400"
          >
            Create
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-10">
      <button
        type="button"
        onClick={() => setMode("choose")}
        className="self-start text-xs text-slate-400 hover:text-slate-200"
      >
        ← back
      </button>
      <h1 className="text-2xl font-semibold">Join a Vault</h1>
      <p className="text-sm text-slate-400">
        Paste the invite token your admin sent you.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!displayName.trim() || !token.trim()) return;
          onJoin(token.trim(), displayName.trim());
        }}
        className="flex flex-col gap-3"
      >
        <input
          type="text"
          placeholder="Your name (e.g. Marcus)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="rounded-xl bg-slate-800 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
        <textarea
          placeholder="Paste invite token here…"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          rows={4}
          className="resize-none rounded-xl bg-slate-800 px-4 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
        <button
          type="submit"
          className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-cyan-400"
        >
          Join
        </button>
      </form>
    </main>
  );
}
