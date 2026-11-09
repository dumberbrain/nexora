import { ENTITY_ROOTS } from "@/shared/api";

import { type SessionListFilters } from "../model/types";

/**
 * Cache policy — sessions
 * owner:        US1 web (monitoring)
 * keys:         sessionKeys.* (["sessions", ...]) — all/lists()/detail(id) follow the
 *               shared/api/entity-keys convention so app/socket-bridge patches them
 * staleTime:    30 s   gcTime: 10 min
 * invalidation: US3 controls (stop/interrupt/resume/restart) → setQueryData(detail(id)) +
 *               invalidate lists() (execution controls read lists({ executionId }))
 * realtime:     socket `entity.changed` kind=session → patch detail(id) (holds a Session,
 *               never the {session, agents} wrapper) + invalidate lists()
 */
export const sessionKeys = {
  all: [ENTITY_ROOTS.session] as const,
  lists: () => [...sessionKeys.all, "list"] as const,
  list: (filters: SessionListFilters) => [...sessionKeys.lists(), filters] as const,
  details: () => [...sessionKeys.all, "detail"] as const,
  detail: (id: string) => [...sessionKeys.details(), id] as const,
};

export const SESSION_CACHE = { staleTime: 30_000, gcTime: 10 * 60_000 } as const;
