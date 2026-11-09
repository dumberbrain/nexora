import { queryOptions } from "@tanstack/react-query";

import { TEAM_CACHE, teamKeys } from "./query-keys";
import { teamApi } from "./team.api";

export const teamViewQuery = (sessionId: string) =>
  queryOptions({
    queryKey: teamKeys.bySession(sessionId),
    queryFn: ({ signal }) => teamApi.bySession(sessionId, { signal }),
    ...TEAM_CACHE,
  });
