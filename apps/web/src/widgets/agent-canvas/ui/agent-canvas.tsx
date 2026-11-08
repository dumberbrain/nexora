import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Background, BackgroundVariant, Controls, ReactFlow, type NodeTypes } from "@xyflow/react";

import "@xyflow/react/dist/style.css";

import { agentListQuery, MAX_AGENTS } from "@/entities/agent";
import { useThemeStore } from "@/features/toggle-theme";
import { EmptyState, ErrorState, LoadingState } from "@/shared/ui/state";

import { AgentNode } from "./components/agent-node";
import { toFlow } from "../lib/to-flow";
import { useActivityPulse } from "../model/use-activity-pulse";

const NODE_TYPES: NodeTypes = { agent: AgentNode };

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

  const { nodes, edges } = toFlow(agents.data.items, pulsing);
  return (
    <section
      aria-label="Agent canvas"
      className="h-[70vh] min-h-96 border border-border bg-terminal"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        colorMode={colorMode}
        nodesDraggable={false}
        nodesConnectable={false}
        fitView
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) =>
          void navigate({ to: "/agents/$agentId", params: { agentId: node.id } })
        }
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </section>
  );
}
