import { RelatedLinks, type RelatedEdge } from "./RelatedLinks.js";

export function RecordDetail({
  title,
  fields,
  edges,
  onOpen,
}: {
  title: string;
  fields: { label: string; value: string }[];
  edges: RelatedEdge[];
  onOpen: (id: string) => void;
}) {
  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-xl font-semibold tracking-tight text-slate-100">{title}</h2>
      {fields.length > 0 && (
        <dl className="flex flex-col gap-2">
          {fields.map((f) => (
            <div key={f.label} className="flex flex-col gap-0.5 text-sm sm:flex-row sm:gap-3">
              <dt className="shrink-0 text-slate-400 sm:w-24">{f.label}</dt>
              <dd className="whitespace-pre-wrap break-words text-slate-200">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="border-t border-slate-800 pt-4">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
          Related
        </h3>
        <RelatedLinks edges={edges} onOpen={onOpen} />
      </div>
    </section>
  );
}
