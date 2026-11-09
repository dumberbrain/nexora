import { MarkerType, type Edge } from "@xyflow/react";

import {
  NODE_KIND_LABEL,
  type GraphIssue,
  type WorkflowGraph,
  type WorkflowNodeRun,
} from "@/entities/workflow";

import { type WorkflowFlowNode } from "../ui/components/workflow-node";

/** Issues by the node/edge id they are about (graph-wide issues are left out). */
export function groupIssues(issues: GraphIssue[]): Map<string, GraphIssue[]> {
  const byRef = new Map<string, GraphIssue[]>();
  for (const issue of issues) {
    if (issue.ref === null) continue;
    byRef.set(issue.ref, [...(byRef.get(issue.ref) ?? []), issue]);
  }
  return byRef;
}

interface FlowInput {
  graph: WorkflowGraph;
  selectedId: string | null;
  issues: GraphIssue[];
  runs: WorkflowNodeRun[] | undefined;
  editable: boolean;
}

/** Workflow graph → React Flow nodes/edges with issue markers, run overlay and branch labels. */
export function toFlow({ graph, selectedId, issues, runs, editable }: FlowInput) {
  const runByNode = new Map(runs?.map((r) => [r.nodeId, r]));
  const issuesByRef = groupIssues(issues);
  const fixed = new Set(["start", "end"]);

  const nodes: WorkflowFlowNode[] = graph.nodes.map((node) => {
    const run = runByNode.get(node.id);
    const nodeIssues = issuesByRef.get(node.id) ?? [];
    return {
      id: node.id,
      type: "workflow" as const,
      position: node.position,
      selected: node.id === selectedId,
      deletable: editable && !fixed.has(node.kind),
      data: { node, issues: nodeIssues, run },
      ariaLabel: [
        `${NODE_KIND_LABEL[node.kind]} node ${node.label}`,
        run ? `status ${run.status}` : null,
        nodeIssues.length > 0 ? `${nodeIssues.length} issues` : null,
      ]
        .filter(Boolean)
        .join(", "),
    };
  });

  const edges: Edge[] = graph.edges.map((edge) => {
    const bad = issuesByRef.has(edge.id);
    const active = runByNode.get(edge.target)?.status === "running";
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      deletable: editable,
      animated: active,
      markerEnd: { type: MarkerType.ArrowClosed },
      ...(edge.branch ? { label: edge.branch } : {}),
      style: {
        stroke: bad ? "var(--destructive)" : active ? "var(--phosphor)" : "var(--border)",
        strokeWidth: bad || active ? 2 : 1,
      },
      ariaLabel: `${edge.source} to ${edge.target}${edge.branch ? ` when ${edge.branch}` : ""}`,
    };
  });
  return { nodes, edges };
}
