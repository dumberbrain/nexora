import { useState } from "react";

import {
  type WorkflowEdge,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowNodeKind,
} from "@/entities/workflow";

import * as ops from "../lib/graph-ops";

export interface WorkflowDraft {
  graph: WorkflowGraph;
  /** true once the graph differs from the version it was opened from */
  dirty: boolean;
  selectedId: string | null;
  select: (id: string | null) => void;
  addNode: (kind: WorkflowNodeKind) => void;
  updateNode: (id: string, patch: Partial<Omit<WorkflowNode, "id" | "kind">>) => void;
  removeNode: (id: string) => void;
  moveNode: (id: string, position: WorkflowNode["position"]) => void;
  connect: (source: string, target: string, branch?: WorkflowEdge["branch"]) => void;
  removeEdge: (id: string) => void;
}

/**
 * Local, unsaved edits of one workflow version. Key the owner by workflow id + version so
 * opening another version starts a fresh draft.
 */
export function useWorkflowDraft(initial: WorkflowGraph): WorkflowDraft {
  const [base] = useState(initial);
  const [graph, setGraph] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return {
    graph,
    dirty: graph !== base,
    selectedId,
    select: setSelectedId,
    addNode: (kind) => {
      const next = ops.addNode(graph, kind);
      setGraph(next.graph);
      setSelectedId(next.id);
    },
    updateNode: (id, patch) => setGraph((g) => ops.updateNode(g, id, patch)),
    removeNode: (id) => {
      setGraph((g) => ops.removeNode(g, id));
      setSelectedId((s) => (s === id ? null : s));
    },
    moveNode: (id, position) => setGraph((g) => ops.moveNode(g, id, position)),
    connect: (source, target, branch) =>
      setGraph((g) => ops.connect(g, source, target, branch ?? undefined)),
    removeEdge: (id) => setGraph((g) => ops.removeEdge(g, id)),
  };
}
