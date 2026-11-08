import { queryOptions } from "@tanstack/react-query";

import { SESSION_CACHE, sessionKeys } from "./query-keys";
import { sessionApi } from "./session.api";
import { type SessionListFilters } from "../model/types";

export const sessionListQuery = (filters: SessionListFilters = {}) =>
  queryOptions({
    queryKey: sessionKeys.list(filters),
    queryFn: ({ signal }) => sessionApi.list(filters, { signal }),
    ...SESSION_CACHE,
  });

/**
 * Stores the bare Session under detail(id) so realtime patches apply; the session's agents
 * come from agentListQuery({ sessionId }) (its own cache, invalidated on agent changes).
 */
export const sessionDetailQuery = (id: string) =>
  queryOptions({
    queryKey: sessionKeys.detail(id),
    queryFn: ({ signal }) => sessionApi.byId(id, { signal }).then((d) => d.session),
    ...SESSION_CACHE,
  });
