import React, { useState } from "react";

export interface SearchBarProps {
  onSubmit: (query: string) => void;
}

export function SearchBar({ onSubmit }: SearchBarProps) {
  const [query, setQuery] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!query.trim()) return;
        onSubmit(query.trim());
        setQuery("");
      }}
    >
      <input
        type="text"
        placeholder="Ask anything…"
        aria-label="Search query"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="flex-1 rounded-xl bg-slate-800 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
      />
      <button
        type="submit"
        className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-cyan-400"
      >
        Ask
      </button>
    </form>
  );
}
