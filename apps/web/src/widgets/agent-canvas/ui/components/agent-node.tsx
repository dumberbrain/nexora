import { Link } from "@tanstack/react-router";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { AGENT_KIND_LABEL, AgentKindIcon, type Agent } from "@/entities/agent";
import { StatusBadge, toStatusKind } from "@/entities/status";
import { cn } from "@/shared/lib/cn";

import { NODE_HEIGHT, NODE_WIDTH } from "../../lib/layout-tree";

export type AgentNodeData = { agent: Agent; pulsing: boolean };
export type AgentFlowNode = Node<AgentNodeData, "agent">;

/** Canvas node (FR-025): name, kind, current task, status; pulses on related live activity. */
export function AgentNode({ data, selected }: NodeProps<AgentFlowNode>) {
  const { agent, pulsing } = data;
  return (
    <div
      data-pulsing={pulsing}
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      className={cn(
        "flex flex-col gap-1.5 border border-border bg-card p-3 font-mono text-xs transition-shadow duration-300",
        selected && "corner-brackets border-phosphor/60",
        pulsing && "border-phosphor shadow-glow",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-phosphor"
        isConnectable={false}
      />
      <div className="flex items-center justify-between gap-2">
        <AgentKindIcon kind={agent.kind} labelled />
        <StatusBadge kind={toStatusKind(agent.status)} />
      </div>
      <Link
        to="/agents/$agentId"
        params={{ agentId: agent.id }}
        className="nodrag truncate text-sm text-foreground hover:text-phosphor focus-visible:text-phosphor"
        aria-label={`${agent.name} (${AGENT_KIND_LABEL[agent.kind]}) — open details`}
        title={agent.id}
      >
        {agent.name}
      </Link>
      <p className="truncate text-[11px] text-muted-foreground">
        <span className="text-index">task </span>
        {agent.currentTaskId ?? "none"}
      </p>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-phosphor"
        isConnectable={false}
      />
    </div>
  );
}
