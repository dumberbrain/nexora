import { type QueryClient } from "@tanstack/react-query";

import { eventFeedQuery, EventFiltersSchema, type EventFilters } from "@/entities/event";

/** /logs search params = event filters (zod, invalid values dropped). */
export const logsSearchSchema = EventFiltersSchema;

/** Drop keys whose value is undefined so the loader key matches the view's key. */
export function cleanFilters(search: Record<string, unknown>): EventFilters {
  return Object.fromEntries(Object.entries(search).filter(([, v]) => v !== undefined));
}

export function loadLogs(qc: QueryClient, filters: EventFilters) {
  return qc.ensureInfiniteQueryData(eventFeedQuery(filters));
}
