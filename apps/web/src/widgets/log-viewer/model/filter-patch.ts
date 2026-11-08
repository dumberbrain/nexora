import { type EventFilters } from "@/entities/event";

/** A partial filter change; `undefined` clears that filter. */
export type FilterPatch = { [K in keyof EventFilters]?: EventFilters[K] | undefined };

/** Apply a patch and drop cleared/empty values so the URL stays minimal. */
export function applyFilterPatch(filters: EventFilters, patch: FilterPatch): EventFilters {
  const merged: Record<string, unknown> = { ...filters, ...patch };
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) delete merged[k];
  }
  return merged;
}
