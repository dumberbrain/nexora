import { type Edge } from "@xyflow/react";

import { type Agent } from "@/entities/agent";

import { layoutAgentTree } from "./layout-tree";
import { type AgentFlowNode } from "../ui/components/agent-node";

/** Agents → positioned React Flow nodes + parent→child edges; pulsing ids light both up. */
export function toFlow(
  agents: Agent[],
  pulsing: ReadonlySet<string>,
): { nodes: AgentFlowNode[]; edges: Edge[] } {
  const { nodes, edges } = layoutAgentTree(agents);
  const byId = new Map(agents.map((a) => [a.id, a]));
  return {
    nodes: nodes.flatMap((n) => {
      const agent = byId.get(n.id);
      if (!agent) return [];
      return [
        {
          id: n.id,
          type: "agent" as const,
          position: { x: n.x, y: n.y },
          data: { agent, pulsing: pulsing.has(n.id) },
          ariaLabel: `${agent.name}, ${agent.status}`,
        },
      ];
    }),
    edges: edges.map((e) => {
      const active = pulsing.has(e.target);
      return {
        ...e,
        type: "smoothstep",
        animated: active,
        style: {
          stroke: active ? "var(--phosphor)" : "var(--border)",
          strokeWidth: active ? 2 : 1,
        },
        ariaLabel: `parent ${e.source} → child ${e.target}`,
      };
    }),
  };
}
