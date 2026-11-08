import { ENTITY_ROOTS } from "@/shared/api";

import { type AgentListFilters } from "../model/types";

/**
 * Cache policy — agents
 * owner:        US1 web (monitoring)
 * keys:         agentKeys.* (["agents", ...]) — all/lists()/detail(id) follow the
 *               shared/api/entity-keys convention so app/socket-bridge patches them
 * staleTime:    lists 15 s, insight 10 s   gcTime: 10 min
 * invalidation: none from the web (agents are observed, not mutated in US1)
 * realtime:     socket `entity.changed` kind=agent → patch detail(id) + invalidate lists();
 *               insight(id) (the GET /agents/:id wrapper: agent + session + children + files)
 *               is invalidated by the details panel when agent-scoped live events arrive
 */
export const agentKeys = {
  all: [ENTITY_ROOTS.agent] as const,
  lists: () => [...agentKeys.all, "list"] as const,
  list: (filters: AgentListFilters) => [...agentKeys.lists(), filters] as const,
  details: () => [...agentKeys.all, "detail"] as const,
  detail: (id: string) => [...agentKeys.details(), id] as const,
  insight: (id: string) => [...agentKeys.all, "insight", id] as const,
};

export const AGENT_LIST_CACHE = { staleTime: 15_000, gcTime: 10 * 60_000 } as const;
export const AGENT_INSIGHT_CACHE = { staleTime: 10_000, gcTime: 10 * 60_000 } as const;
