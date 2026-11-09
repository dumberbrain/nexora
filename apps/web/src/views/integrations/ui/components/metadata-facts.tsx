import { isRedacted } from "@/entities/integration";

import { Tag } from "./tag";

const MAX_VALUE = 200;
/** shown elsewhere on the row */
const SKIP = new Set(["description"]);

const label = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

function Value({ name, value }: { name: string; value: unknown }) {
  if (isRedacted(value)) return <Tag className="border-status-paused/60">redacted</Tag>;
  if (Array.isArray(value)) {
    const strings = value.filter((v): v is string => typeof v === "string");
    // key-name lists (envKeys, headerKeys): names only — the values never leave the server
    if (name.endsWith("Keys")) {
      return (
        <span className="flex flex-wrap gap-1">
          {strings.map((k) => (
            <code key={k} className="border border-border px-1 text-[11px]">
              {k}
            </code>
          ))}
        </span>
      );
    }
    return <span>{strings.join(", ")}</span>;
  }
  if (typeof value === "string") {
    return <span>{value.length > MAX_VALUE ? `${value.slice(0, MAX_VALUE - 1)}…` : value}</span>;
  }
  if (typeof value === "number" || typeof value === "boolean") return <span>{String(value)}</span>;
  return <span className="text-muted-foreground">…</span>;
}

/** Free-form (already redacted) metadata as a compact definition list. */
export function MetadataFacts({ metadata }: { metadata: Record<string, unknown> }) {
  const entries = Object.entries(metadata).filter(([k, v]) => !SKIP.has(k) && v !== null);
  if (entries.length === 0) return null;
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 font-mono text-xs">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-muted-foreground">{label(key)}</dt>
          <dd className="min-w-0 break-all text-foreground">
            <Value name={key} value={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
