import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import {
  executionDetailQuery,
  ExecutionModeLabel,
  isLaunched,
  setupStepOf,
} from "@/entities/execution";
import { ExecutionStatusBadge } from "@/entities/status";
import { ExecutionControls } from "@/features/control-session";
import { formatDateTime } from "@/shared/lib/format-time";
import { useLiveSubscription } from "@/shared/socket/use-live-subscription";
import { PageHeader } from "@/shared/ui/layout/page-header";
import { ErrorState, LoadingState } from "@/shared/ui/state";
import { WorkflowRunOverlay } from "@/widgets/workflow-editor";

import { ExecutionOperations } from "./components/execution-operations";
import { TaskStatusTable } from "./components/task-status-table";
import { VerificationSummary } from "./components/verification-summary";
import { refreshOnEvents } from "../model/load-execution";

const VERIFIED = new Set(["verifying", "completed", "failed", "cancelled"]);

/** One execution: status, mode, live task statuses (execution room) and the verification summary. */
export function ExecutionView({ executionId }: { executionId: string }) {
  const qc = useQueryClient();
  const execution = useQuery(executionDetailQuery(executionId));
  useLiveSubscription({
    scope: "execution",
    id: executionId,
    onEvents: (events) => void refreshOnEvents(qc, executionId, events),
  });
  const e = execution.data;
  const launched = e ? isLaunched(e.status) : false;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        index="04"
        title={`Execution ${executionId.slice(-6)}`}
        description={e ? <span className="whitespace-pre-wrap">{e.prompt}</span> : null}
        actions={
          e ? (
            <>
              <ExecutionModeLabel mode={e.mode} strategy={e.strategy} />
              <ExecutionStatusBadge status={e.status} />
              {launched ? <ExecutionControls execution={e} className="basis-full" /> : null}
            </>
          ) : null
        }
      />
      {execution.isPending ? <LoadingState label="Loading execution" rows={3} /> : null}
      {execution.isError ? (
        <ErrorState
          title="Execution unavailable"
          error={execution.error}
          onRetry={() => void execution.refetch()}
        />
      ) : null}
      {e && !launched ? (
        <p className="font-mono text-xs text-status-waiting">
          This execution is still being set up — nothing runs until its plan is approved.{" "}
          <Link
            to="/executions/new"
            search={{ step: setupStepOf(e.status), executionId }}
            className="text-phosphor hover:underline"
          >
            continue setup →
          </Link>
        </p>
      ) : null}
      {e ? (
        <dl className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px]">
          <dt className="text-muted-foreground">created</dt>
          <dd>{formatDateTime(e.createdAt)}</dd>
          <dt className="text-muted-foreground">worktree</dt>
          <dd className="break-all">{e.worktreePath ?? "not created yet"}</dd>
          <dt className="text-muted-foreground">permission bypass</dt>
          <dd className={e.permissionBypass ? "text-status-failed" : undefined}>
            {e.permissionBypass ? "on" : "off"}
          </dd>
        </dl>
      ) : null}
      {e?.mode === "workflow" ? <WorkflowRunOverlay executionId={executionId} /> : null}
      <section aria-labelledby="execution-tasks" className="flex min-w-0 flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="execution-tasks" className="text-sm tracking-widest">
            Tasks
          </h2>
          <Link
            to="/communication"
            search={{ executionId }}
            className="font-mono text-xs text-phosphor hover:underline"
          >
            messages →
          </Link>
        </div>
        <TaskStatusTable executionId={executionId} withControls={launched} />
      </section>
      {e && launched ? <ExecutionOperations execution={e} /> : null}
      {e && VERIFIED.has(e.status) ? <VerificationSummary verification={e.verification} /> : null}
    </div>
  );
}
