import { type QueryClient } from "@tanstack/react-query";

import { agentListQuery, MAX_AGENTS } from "@/entities/agent";
import { sessionDetailQuery } from "@/entities/session";

export const sessionAgentsFilters = (sessionId: string) => ({ sessionId, limit: MAX_AGENTS });

/** Route loader: the session and its agents in parallel; the timeline loads in the view. */
export function loadSession(qc: QueryClient, sessionId: string) {
  return Promise.all([
    qc.ensureQueryData(sessionDetailQuery(sessionId)),
    qc.ensureQueryData(agentListQuery(sessionAgentsFilters(sessionId))),
  ]);
}
