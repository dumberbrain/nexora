import { type ReactNode } from "react";

import { type WorkflowNodeRun } from "@/entities/workflow";

import { Inspector } from "./components/inspector";
import { NodePalette } from "./components/node-palette";
import { WorkflowCanvas } from "./components/workflow-canvas";
import { useGraphValidation } from "../model/use-graph-validation";
import { type WorkflowDraft } from "../model/use-workflow-draft";

interface WorkflowEditorProps {
  /** from useWorkflowDraft — the owner keeps it to save/run the current graph */
  draft: WorkflowDraft;
  /** older versions and run overlays: no palette, no edits, no validation */
  readOnly?: boolean;
  /** live run state per node (overlay) */
  runs?: WorkflowNodeRun[] | undefined;
  /** save / version / run controls rendered above the canvas */
  toolbar?: ReactNode;
}

/**
 * Workflow editor (US5): React Flow canvas + node palette + per-node property panel, inline
 * server validation and an optional live run overlay. Every canvas gesture has a keyboard
 * alternative (palette buttons, node picker, connection form, delete button).
 */
export function WorkflowEditor({ draft, readOnly = false, runs, toolbar }: WorkflowEditorProps) {
  const validation = useGraphValidation(draft.graph, !readOnly);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {toolbar ? <div className="flex flex-wrap items-end gap-3">{toolbar}</div> : null}
      <div
        className={
          readOnly
            ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]"
            : "grid gap-4 lg:grid-cols-[11rem_minmax(0,1fr)_20rem]"
        }
      >
        {readOnly ? null : <NodePalette onAdd={draft.addNode} />}
        <WorkflowCanvas draft={draft} issues={validation.issues} runs={runs} readOnly={readOnly} />
        <Inspector
          draft={draft}
          readOnly={readOnly}
          runs={runs}
          validation={readOnly ? null : validation}
        />
      </div>
    </div>
  );
}
