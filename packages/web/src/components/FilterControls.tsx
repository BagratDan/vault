import React from "react";

export interface Filters {
  tags?: string[];
  createdAfter?: string;
  createdBefore?: string;
}

export interface FilterControlsProps {
  value: Filters;
  onChange: (next: Filters) => void;
}

export function FilterControls({ value, onChange }: FilterControlsProps) {
  return (
    <details className="rounded-xl bg-slate-900 p-3 text-sm">
      <summary className="cursor-pointer text-slate-400">Filters</summary>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input
          type="text"
          placeholder="tags (comma-separated)"
          value={value.tags?.join(",") ?? ""}
          onChange={(e) => {
            const tags = e.target.value
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean);
            const next: Filters = { ...value };
            if (tags.length > 0) next.tags = tags;
            else delete next.tags;
            onChange(next);
          }}
          className="rounded-lg bg-slate-800 px-3 py-1.5"
        />
        <input
          type="date"
          value={value.createdAfter?.slice(0, 10) ?? ""}
          onChange={(e) => {
            const next: Filters = { ...value };
            if (e.target.value) next.createdAfter = `${e.target.value}T00:00:00.000Z`;
            else delete next.createdAfter;
            onChange(next);
          }}
          className="rounded-lg bg-slate-800 px-3 py-1.5"
        />
        <input
          type="date"
          value={value.createdBefore?.slice(0, 10) ?? ""}
          onChange={(e) => {
            const next: Filters = { ...value };
            if (e.target.value) next.createdBefore = `${e.target.value}T23:59:59.999Z`;
            else delete next.createdBefore;
            onChange(next);
          }}
          className="rounded-lg bg-slate-800 px-3 py-1.5"
        />
      </div>
    </details>
  );
}
