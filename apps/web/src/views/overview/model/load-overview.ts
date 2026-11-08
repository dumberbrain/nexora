import { type QueryClient } from "@tanstack/react-query";

import { projectListQuery } from "@/entities/project";
import { sessionListQuery, type SessionListFilters } from "@/entities/session";
import { statsQuery } from "@/entities/stats";

/** Recent sessions shown on the overview. */
export const RECENT_SESSIONS: SessionListFilters = { limit: 8 };

/** Route loader: counters, projects and recent sessions in parallel (no waterfalls). */
export function loadOverview(qc: QueryClient) {
  return Promise.all([
    qc.ensureQueryData(statsQuery()),
    qc.ensureQueryData(projectListQuery()),
    qc.ensureQueryData(sessionListQuery(RECENT_SESSIONS)),
  ]);
}
