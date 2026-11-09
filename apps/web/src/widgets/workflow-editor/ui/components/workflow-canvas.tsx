import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type EdgeChange,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

import { type GraphIssue, type WorkflowNodeRun } from "@/entities/workflow";
import { useThemeStore } from "@/features/toggle-theme";

import { WorkflowNodeView, type WorkflowFlowNode } from "./workflow-node";
import { toFlow } from "../../lib/to-flow";
import { type WorkflowDraft } from "../../model/use-workflow-draft";

const NODE_TYPES: NodeTypes = { workflow: WorkflowNodeView };

interface WorkflowCanvasProps {
  draft: WorkflowDraft;
  issues: GraphIssue[];
  runs: WorkflowNodeRun[] | undefined;
  readOnly: boolean;
}

/**
 * React Flow view of the draft. Drag, connect and Delete work here; every one of them also has
 * a keyboard/form alternative in the palette and the property panel (never drag-only).
 */
export function WorkflowCanvas({ draft, issues, runs, readOnly }: WorkflowCanvasProps) {
  const colorMode = useThemeStore((s) => s.resolved);
  const { nodes, edges } = toFlow({
    graph: draft.graph,
    selectedId: draft.selectedId,
    issues,
    runs,
    editable: !readOnly,
  });

  const onNodesChange = (changes: NodeChange<WorkflowFlowNode>[]) => {
    for (const change of changes) {
      if (change.type === "position" && change.position && !readOnly) {
        draft.moveNode(change.id, change.position);
      } else if (change.type === "select" && change.selected) {
        draft.select(change.id);
      } else if (change.type === "remove" && !readOnly) {
        draft.removeNode(change.id);
      }
    }
  };
  const onEdgesChange = (changes: EdgeChange[]) => {
    if (readOnly) return;
    for (const change of changes) if (change.type === "remove") draft.removeEdge(change.id);
  };

  return (
    <section
      aria-label="Workflow canvas"
      className="h-[60vh] min-h-96 min-w-0 border border-border bg-terminal"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        colorMode={colorMode}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={(c) => draft.connect(c.source, c.target)}
        onPaneClick={() => draft.select(null)}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        edgesFocusable={!readOnly}
        deleteKeyCode={readOnly ? null : ["Delete", "Backspace"]}
        fitView
        fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </section>
  );
}
