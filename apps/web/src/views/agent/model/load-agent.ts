import { type QueryClient } from "@tanstack/react-query";

import { agentInsightQuery, agentListQuery, MAX_AGENTS } from "@/entities/agent";

/** Route loader: the agent (panel) and its session's tree (canvas behind the panel). */
export async function loadAgent(qc: QueryClient, agentId: string) {
  const detail = await qc.ensureQueryData(agentInsightQuery(agentId));
  await qc.ensureQueryData(
    agentListQuery({ sessionId: detail.agent.sessionId, limit: MAX_AGENTS }),
  );
  return detail.agent.sessionId;
}
