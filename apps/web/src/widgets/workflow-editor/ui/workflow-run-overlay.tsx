import { useQuery } from "@tanstack/react-query";

import { StatusBadge } from "@/entities/status";
import {
  NODE_RUN_STATUS_LABEL,
  workflowRunQuery,
  type WorkflowRunDetail,
} from "@/entities/workflow";
import { ErrorState, LoadingState } from "@/shared/ui/state";

import { WorkflowEditor } from "./workflow-editor";
import { nodeRunStatusKind } from "../lib/run-status";
import { useWorkflowDraft } from "../model/use-workflow-draft";

/**
 * Read-only editor of the version an execution runs, with each node's live state. The cache is
 * kept live by the execution room (applyWorkflowEvents in the execution view).
 */
export function WorkflowRunOverlay({ executionId }: { executionId: string }) {
  const run = useQuery(workflowRunQuery(executionId));
  if (run.isPending) return <LoadingState label="Loading workflow run" rows={3} />;
  if (run.isError) {
    return (
      <ErrorState
        title="Workflow run unavailable"
        error={run.error}
        onRetry={() => void run.refetch()}
      />
    );
  }
  return <RunBody key={run.data.version.id} detail={run.data} />;
}

function RunBody({ detail }: { detail: WorkflowRunDetail }) {
  const draft = useWorkflowDraft(detail.version.graph);
  return (
    <section aria-labelledby="wf-run" className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="wf-run" className="text-sm tracking-widest">
          Workflow run
        </h2>
        <span className="font-mono text-xs text-muted-foreground">
          version {detail.version.version}
        </span>
        <StatusBadge
          kind={nodeRunStatusKind(detail.run.status)}
          label={`Run ${NODE_RUN_STATUS_LABEL[detail.run.status]}`}
        />
      </div>
      <WorkflowEditor draft={draft} readOnly runs={detail.nodes} />
    </section>
  );
}
