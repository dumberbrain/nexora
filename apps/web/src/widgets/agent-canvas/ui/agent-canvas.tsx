import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Background, BackgroundVariant, Controls, ReactFlow, type NodeTypes } from "@xyflow/react";

import "@xyflow/react/dist/style.css";

import { agentListQuery, MAX_AGENTS } from "@/entities/agent";
import { useThemeStore } from "@/features/toggle-theme";
import { EmptyState, ErrorState, LoadingState } from "@/shared/ui/state";

import { AgentNode } from "./components/agent-node";
import { TeamGroup } from "./components/team-group";
import { teamGroups } from "../lib/team-groups";
import { toFlow } from "../lib/to-flow";
import { useActivityPulse } from "../model/use-activity-pulse";

const NODE_TYPES: NodeTypes = { agent: AgentNode, teamGroup: TeamGroup };

interface AgentCanvasProps {
  /** restrict to one session's agent tree; all observed agents otherwise */
  sessionId?: string | undefined;
}

/** Agent Canvas (FR-025): live agent tree; click a node for its details. */
export function AgentCanvas({ sessionId }: AgentCanvasProps) {
  const agents = useQuery(
    agentListQuery(sessionId ? { sessionId, limit: MAX_AGENTS } : { limit: MAX_AGENTS }),
  );
  const pulsing = useActivityPulse();
  const navigate = useNavigate();
  const colorMode = useThemeStore((s) => s.resolved);

  if (agents.isPending) return <LoadingState label="Loading agents" rows={5} />;
  if (agents.isError) {
    return (
      <ErrorState
        title="Agents unavailable"
        error={agents.error}
        onRetry={() => void agents.refetch()}
      />
    );
  }
  if (agents.data.items.length === 0) {
    return (
      <EmptyState
        title="No agents yet"
        description="Agents appear when an observed Claude Code session starts or delegates to a subagent."
      />
    );
  }

  const flow = toFlow(agents.data.items, pulsing);
  // team frames first so they render behind their members
  const nodes = [...teamGroups(agents.data.items, flow.nodes), ...flow.nodes];
  return (
    <section
      aria-label="Agent canvas"
      className="h-[70vh] min-h-96 border border-border bg-terminal"
    >
      <ReactFlow
        nodes={nodes}
        edges={flow.edges}
        nodeTypes={NODE_TYPES}
        colorMode={colorMode}
        nodesDraggable={false}
        nodesConnectable={false}
        fitView
        // a small tree must not be blown up to fill the viewport
        fitViewOptions={{ maxZoom: 1, padding: 0.3 }}
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          if (node.type === "agent") {
            void navigate({ to: "/agents/$agentId", params: { agentId: node.id } });
          }
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </section>
  );
}
