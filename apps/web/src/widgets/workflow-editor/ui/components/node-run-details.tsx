import { StatusBadge } from "@/entities/status";
import { NODE_RUN_STATUS_LABEL, type WorkflowNodeRun } from "@/entities/workflow";

import { LABEL_CLASS } from "./field-styles";
import { nodeRunStatusKind } from "../../lib/run-status";

/** Latest attempt of the selected node in the run being watched. */
export function NodeRunDetails({ run }: { run: WorkflowNodeRun | undefined }) {
  return (
    <section aria-labelledby="wf-node-run" className="flex flex-col gap-2">
      <h3 id="wf-node-run" className={LABEL_CLASS}>
        Run state
      </h3>
      {run ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs">
          <dt className="text-muted-foreground">status</dt>
          <dd>
            <StatusBadge
              kind={nodeRunStatusKind(run.status)}
              label={NODE_RUN_STATUS_LABEL[run.status]}
            />
          </dd>
          <dt className="text-muted-foreground">attempt</dt>
          <dd>{run.attempt}</dd>
          {run.outputSummary ? (
            <>
              <dt className="text-muted-foreground">output</dt>
              <dd className="whitespace-pre-wrap">{run.outputSummary}</dd>
            </>
          ) : null}
          {run.error ? (
            <>
              <dt className="text-muted-foreground">error</dt>
              <dd className="whitespace-pre-wrap text-destructive">{run.error}</dd>
            </>
          ) : null}
        </dl>
      ) : (
        <p className="font-mono text-xs text-muted-foreground">Not reached yet.</p>
      )}
    </section>
  );
}
