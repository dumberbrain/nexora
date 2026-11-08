import { type AgentStatus } from "@nexora/contracts";

export type { Agent, AgentDetail, AgentKind, AgentList, AgentStatus } from "@nexora/contracts";

/** GET /agents filters — plain primitives only (they become part of the query key). */
export type AgentListFilters = {
  sessionId?: string;
  status?: AgentStatus[];
  limit?: number;
};
