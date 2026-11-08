import { queryOptions } from "@tanstack/react-query";

import { agentApi } from "./agent.api";
import { AGENT_INSIGHT_CACHE, AGENT_LIST_CACHE, agentKeys } from "./query-keys";
import { type AgentListFilters } from "../model/types";

/** Upper bound the server accepts for one agent list page (AgentListQuerySchema). */
export const MAX_AGENTS = 500;

export const agentListQuery = (filters: AgentListFilters = {}) =>
  queryOptions({
    queryKey: agentKeys.list(filters),
    queryFn: ({ signal }) => agentApi.list(filters, { signal }),
    ...AGENT_LIST_CACHE,
  });

/** Full GET /agents/:id payload: agent, its session, children and derived files changed. */
export const agentInsightQuery = (id: string) =>
  queryOptions({
    queryKey: agentKeys.insight(id),
    queryFn: ({ signal }) => agentApi.byId(id, { signal }),
    ...AGENT_INSIGHT_CACHE,
  });
