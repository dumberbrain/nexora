import { type AgentKind } from "./types";

export const AGENT_KIND_LABEL: Record<AgentKind, string> = {
  main: "main agent",
  subagent: "subagent",
  team_lead: "team lead",
  teammate: "teammate",
  workflow_node: "workflow node",
};
