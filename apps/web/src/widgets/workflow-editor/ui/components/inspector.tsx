import { type GraphIssue, type WorkflowNodeRun } from "@/entities/workflow";

import { ConnectionsPanel } from "./connections-panel";
import { IssuesList } from "./issues-list";
import { NodePicker } from "./node-picker";
import { NodeRunDetails } from "./node-run-details";
import { PropertyPanel } from "./property-panel";
import { type WorkflowDraft } from "../../model/use-workflow-draft";

interface InspectorProps {
  draft: WorkflowDraft;
  readOnly: boolean;
  runs: WorkflowNodeRun[] | undefined;
  /** null = validation not shown (read-only views) */
  validation: { issues: GraphIssue[]; checking: boolean; failed: boolean } | null;
}

/** Side panel: node picker, selected node's properties + connections (+ run state), issues. */
export function Inspector({ draft, readOnly, runs, validation }: InspectorProps) {
  const { graph, selectedId } = draft;
  const node = graph.nodes.find((n) => n.id === selectedId);
  return (
    <aside aria-label="Node inspector" className="flex min-w-0 flex-col gap-5">
      <NodePicker nodes={graph.nodes} value={node?.id ?? null} onChange={draft.select} />
      {node ? (
        <>
          {runs ? <NodeRunDetails run={runs.find((r) => r.nodeId === node.id)} /> : null}
          <PropertyPanel
            key={`${node.id}:${node.kind}`}
            node={node}
            nodes={graph.nodes}
            readOnly={readOnly}
            onApply={draft.updateNode}
            onDelete={draft.removeNode}
          />
          <ConnectionsPanel node={node} graph={graph} readOnly={readOnly} draft={draft} />
        </>
      ) : (
        <p className="font-mono text-xs text-muted-foreground">
          Select a node on the canvas or in the list above to see its properties.
        </p>
      )}
      {validation ? (
        <IssuesList
          issues={validation.issues}
          graph={graph}
          checking={validation.checking}
          failed={validation.failed}
          onSelect={draft.select}
        />
      ) : null}
    </aside>
  );
}
