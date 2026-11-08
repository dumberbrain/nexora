import { type EventFilters } from "../model/types";

/**
 * Cache policy — events (append-only log)
 * owner:        US1 web (monitoring)
 * keys:         eventKeys.* (["events", ...])
 * staleTime:    5 min (history never changes; new events arrive over the socket)
 * gcTime:       5 min (feeds can be large — drop them soon after the view closes)
 * refetchOnWindowFocus: false (the live subscription keeps the head current)
 * invalidation: none — the log is immutable
 * realtime:     socket `event` batches → useLiveEventFeed prepends matching events to
 *               feed(filters) via setQueryData; a replay gap invalidates that feed
 */
export const eventKeys = {
  all: ["events"] as const,
  lists: () => [...eventKeys.all, "list"] as const,
  feed: (filters: EventFilters, limit: number) =>
    [...eventKeys.lists(), "feed", filters, limit] as const,
};

export const EVENT_CACHE = {
  staleTime: 5 * 60_000,
  gcTime: 5 * 60_000,
  refetchOnWindowFocus: false,
} as const;

/** Page size for the event feed ("load older" fetches this many more). */
export const EVENT_PAGE_SIZE = 100;
