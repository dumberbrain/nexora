import { statsKey } from "@/shared/api";

/**
 * Cache policy — overview stats
 * owner:        US1 web (monitoring)
 * keys:         statsKeys.current() (= shared statsKey ["stats", "current"])
 * staleTime:    30 s   gcTime: 10 min   refetchOnWindowFocus: false
 * invalidation: none (read-only counters)
 * realtime:     socket `stats` (≤ 2/s) → app/socket-bridge replaces the cached value;
 *               GET /stats only seeds it and refreshes after the cache goes stale
 */
export const statsKeys = {
  current: () => statsKey,
};

export const STATS_CACHE = {
  staleTime: 30_000,
  gcTime: 10 * 60_000,
  refetchOnWindowFocus: false,
} as const;
