import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { workflowListQuery, type WorkflowSummary } from "@/entities/workflow";
import { CreateWorkflowForm } from "@/features/edit-workflow";
import { formatDateTime } from "@/shared/lib/format-time";
import { PageHeader } from "@/shared/ui/layout/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/shared/ui/state";

interface WorkflowsViewProps {
  /** a workflow was created — open it in the editor */
  onCreated: (workflowId: string) => void;
}

/** Workflow list (US5): built-in templates and the user's own, plus "create". */
export function WorkflowsView({ onCreated }: WorkflowsViewProps) {
  const workflows = useQuery(workflowListQuery());
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        index="05"
        title="Workflows"
        description="Visual, versioned workflows: agents, skills, MCP tools, conditions, approvals and parallel branches. Saving never changes a version — it creates the next one."
      />
      <CreateWorkflowForm onCreated={(w) => onCreated(w.id)} />
      {workflows.isPending ? <LoadingState label="Loading workflows" rows={3} /> : null}
      {workflows.isError ? (
        <ErrorState
          title="Workflows unavailable"
          error={workflows.error}
          onRetry={() => void workflows.refetch()}
        />
      ) : null}
      {workflows.data?.items.length === 0 ? (
        <EmptyState
          title="No workflows yet"
          description="Create one above — it starts as start → end."
        />
      ) : null}
      {workflows.data && workflows.data.items.length > 0 ? (
        <ul
          aria-label="Workflows"
          className="flex flex-col divide-y divide-border border border-border"
        >
          {workflows.data.items.map((w) => (
            <WorkflowRow key={w.id} workflow={w} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function WorkflowRow({ workflow: w }: { workflow: WorkflowSummary }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline gap-2">
          <Link
            to="/workflows/$workflowId"
            params={{ workflowId: w.id }}
            className="text-base text-foreground hover:text-phosphor focus-visible:text-phosphor"
          >
            {w.name}
          </Link>
          {w.builtIn ? (
            <span className="border border-phosphor/50 px-1.5 font-mono text-[10px] tracking-widest text-phosphor uppercase">
              built-in template
            </span>
          ) : null}
        </div>
        {w.description ? <p className="text-sm text-muted-foreground">{w.description}</p> : null}
      </div>
      <p className="font-mono text-[11px] text-muted-foreground">
        {w.latestVersion ? `v${w.latestVersion}` : "no version yet"} · created{" "}
        {formatDateTime(w.createdAt)}
      </p>
    </li>
  );
}
