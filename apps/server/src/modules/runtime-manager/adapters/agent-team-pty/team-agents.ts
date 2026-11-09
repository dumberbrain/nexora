import { type Agent } from "@nexora/contracts";

import { type TeamAgentSink } from "./team-files-watcher";
import { type AgentRepository } from "../../../agent-registry";
import { type EventBus } from "../../../event-manager";

/**
 * Persists team agents in the agent registry: the lead is the session's main agent row (same id
 * as the hook-derived main agent, re-kinded `team_lead`), teammates are `teammate` children.
 * Only changed fields are written and published.
 */
export function agentRegistryTeamSink(
  repo: Pick<AgentRepository, "get" | "insert" | "update">,
  bus: Pick<EventBus, "publishEntityChanged">,
): TeamAgentSink {
  return {
    upsert(agent: Agent): void {
      const existing = repo.get(agent.id);
      if (!existing) {
        repo.insert(agent);
        bus.publishEntityChanged({ kind: "agent", id: agent.id, patch: { ...agent } });
        return;
      }
      const patch: Partial<Agent> = {};
      if (existing.kind !== agent.kind) patch.kind = agent.kind;
      if (existing.status !== agent.status) patch.status = agent.status;
      if (existing.role !== agent.role) patch.role = agent.role;
      if (existing.name !== agent.name) patch.name = agent.name;
      if (agent.currentTaskId && existing.currentTaskId !== agent.currentTaskId) {
        patch.currentTaskId = agent.currentTaskId;
      }
      if (Object.keys(patch).length === 0) return;
      repo.update(agent.id, patch);
      bus.publishEntityChanged({ kind: "agent", id: agent.id, patch });
    },
  };
}
