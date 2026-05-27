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
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <dl className="flex flex-col gap-1">
        {fields.map((f) => (
          <div key={f.label} className="flex gap-2 text-sm">
            <dt className="opacity-60">{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
      <div>
        <h3 className="mb-1 text-sm font-medium">Related</h3>
        <RelatedLinks edges={edges} onOpen={onOpen} />
      </div>
    </section>
  );
}
