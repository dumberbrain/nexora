import { type IntegrationFilters } from "../model/types";

/**
 * Cache policy — integrations inventory (US7: skills, commands, agents, MCP servers)
 * owner:        US7 web
 * keys:         integrationKeys.* (["integrations", ...]); list(filters) = GET /integrations
 *               for one project scope (kind is split client-side by the page tabs)
 * staleTime:    5 min (the server caches discovery; health is only re-checked on refresh)
 * gcTime:       30 min
 * invalidation: "Refresh" runs GET /integrations?refresh=true and writes the result into
 *               list(filters) with setQueryData — rows update in place, no second request
 * realtime:     none
 */
export const integrationKeys = {
  all: ["integrations"] as const,
  lists: () => [...integrationKeys.all, "list"] as const,
  list: (filters: IntegrationFilters) => [...integrationKeys.lists(), filters] as const,
  /** mutation key of the forced re-discovery */
  refresh: () => [...integrationKeys.all, "refresh"] as const,
};

export const INTEGRATION_CACHE = { staleTime: 5 * 60_000, gcTime: 30 * 60_000 } as const;
