import { type Node } from "@xyflow/react";

import { type Agent } from "@/entities/agent";

import { NODE_HEIGHT, NODE_WIDTH } from "./layout-tree";

/** room above the members for the team header (name + member statuses) */
export const TEAM_HEADER = 52;
const PAD = 12;

export type TeamGroupData = { lead: Agent; members: Agent[] };
export type TeamGroupFlowNode = Node<TeamGroupData, "teamGroup">;

type Positioned = Pick<Node, "id" | "position">;

/** Teammates of a lead: its children, or teammates of the same session whose parent is unknown. */
function teamOf(lead: Agent, agents: readonly Agent[]): Agent[] {
  const teammates = agents.filter(
    (a) =>
      a.kind === "teammate" &&
      (a.parentAgentId === lead.id || (a.sessionId === lead.sessionId && !a.parentAgentId)),
  );
  return [lead, ...teammates];
}

/**
 * One background frame per Agent Teams lead (US6) enclosing the lead and its teammates' nodes,
 * so the team reads as one unit on the canvas. Placed behind the agent nodes, never selectable.
 */
export function teamGroups(
  agents: readonly Agent[],
  nodes: readonly Positioned[],
): TeamGroupFlowNode[] {
  const pos = new Map(nodes.map((n) => [n.id, n.position]));
  return agents
    .filter((a) => a.kind === "team_lead")
    .flatMap((lead) => {
      const members = teamOf(lead, agents).filter((m) => pos.has(m.id));
      const points = members.map((m) => pos.get(m.id)!);
      if (points.length === 0) return [];
      const minX = Math.min(...points.map((p) => p.x)) - PAD;
      const minY = Math.min(...points.map((p) => p.y)) - PAD - TEAM_HEADER;
      const maxX = Math.max(...points.map((p) => p.x)) + NODE_WIDTH + PAD;
      const maxY = Math.max(...points.map((p) => p.y)) + NODE_HEIGHT + PAD;
      return [
        {
          id: `team:${lead.id}`,
          type: "teamGroup" as const,
          position: { x: minX, y: minY },
          data: { lead, members },
          style: { width: maxX - minX, height: maxY - minY },
          zIndex: -1,
          selectable: false,
          draggable: false,
          focusable: false,
        },
      ];
    });
}
