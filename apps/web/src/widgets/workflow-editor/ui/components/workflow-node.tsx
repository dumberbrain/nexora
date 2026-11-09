import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { TriangleAlertIcon } from "lucide-react";

import { StatusBadge } from "@/entities/status";
import {
  NODE_KIND_LABEL,
  NODE_RUN_STATUS_LABEL,
  type GraphIssue,
  type WorkflowNode,
  type WorkflowNodeRun,
} from "@/entities/workflow";
import { cn } from "@/shared/lib/cn";

import { nodeRunStatusKind } from "../../lib/run-status";

export type WorkflowNodeData = {
  node: WorkflowNode;
  issues: GraphIssue[];
  run: WorkflowNodeRun | undefined;
};
export type WorkflowFlowNode = Node<WorkflowNodeData, "workflow">;

export const WF_NODE_WIDTH = 200;

/** Canvas node: kind, label, inline validation issues and the live run state. */
export function WorkflowNodeView({ data, selected, isConnectable }: NodeProps<WorkflowFlowNode>) {
  const { node, issues, run } = data;
  const kindLabel = NODE_KIND_LABEL[node.kind];
  return (
    <div
      data-testid={`wf-node-${node.id}`}
      data-run-status={run?.status}
      style={{ width: WF_NODE_WIDTH }}
      className={cn(
        "flex flex-col gap-1.5 border border-border bg-card p-2.5 font-mono text-xs",
        selected && "corner-brackets border-phosphor/60",
        issues.length > 0 && "border-destructive",
        run?.status === "running" && "border-phosphor shadow-glow",
      )}
    >
      {node.kind !== "start" ? (
        <Handle type="target" position={Position.Top} isConnectable={isConnectable} />
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <span className="text-index text-[10px] tracking-widest uppercase">{kindLabel}</span>
        {node.retry.maxAttempts > 1 ? (
          <span className="text-[10px] text-muted-foreground">×{node.retry.maxAttempts}</span>
        ) : null}
      </div>
      <p className="truncate text-sm text-foreground" title={node.id}>
        {node.label}
      </p>
      {run ? (
        <div className="flex flex-wrap items-center gap-1">
          <StatusBadge
            kind={nodeRunStatusKind(run.status)}
            label={NODE_RUN_STATUS_LABEL[run.status]}
          />
          {run.attempt > 1 ? (
            <span className="text-[10px] text-muted-foreground">attempt {run.attempt}</span>
          ) : null}
        </div>
      ) : null}
      {issues.length > 0 ? (
        <p
          className="flex items-center gap-1 text-[11px] text-destructive"
          title={issues[0]?.message}
        >
          <TriangleAlertIcon className="size-3" aria-hidden="true" />
          {issues.length === 1 ? "1 issue" : `${issues.length} issues`}
        </p>
      ) : null}
      {node.kind !== "end" ? (
        <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} />
      ) : null}
    </div>
  );
}
