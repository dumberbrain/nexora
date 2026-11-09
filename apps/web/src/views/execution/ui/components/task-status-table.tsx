import { useQuery } from "@tanstack/react-query";

import { EXECUTION_MODE_LABEL } from "@/entities/execution";
import { TaskStatusBadge } from "@/entities/status";
import { executionTasksQuery, PriorityTag, RiskClassTag } from "@/entities/task";
import { EmptyState, ErrorState, LoadingState } from "@/shared/ui/state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";

import { TaskActions } from "./task-actions";

const COLUMNS = ["ID", "Task", "Agent", "Mode", "Priority", "Risk", "Status", "Attempt"];

interface TaskStatusTableProps {
  executionId: string;
  /** show per-task cancel / retry / review (launched executions only) */
  withControls?: boolean;
}

/** Live task statuses of one execution (US2-AS6) — refreshed by the view on `task.*` events. */
export function TaskStatusTable({ executionId, withControls = false }: TaskStatusTableProps) {
  const tasks = useQuery(executionTasksQuery(executionId));
  const columns = withControls ? [...COLUMNS, "Actions"] : COLUMNS;

  if (tasks.isPending) return <LoadingState label="Loading tasks" rows={4} />;
  if (tasks.isError) {
    return (
      <ErrorState
        title="Tasks unavailable"
        error={tasks.error}
        onRetry={() => void tasks.refetch()}
      />
    );
  }
  if (tasks.data.items.length === 0) {
    return <EmptyState title="No tasks" description="This execution has no planned tasks." />;
  }
  return (
    <div className="overflow-x-auto border border-border bg-card">
      <Table>
        <caption className="sr-only">Task statuses</caption>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c} className="font-mono text-[10px] tracking-widest uppercase">
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.data.items.map((t) => (
            <TableRow key={t.id} className="align-top font-mono text-xs">
              <TableCell className="text-phosphor">{t.id}</TableCell>
              <TableCell className="max-w-80 whitespace-normal">{t.title}</TableCell>
              <TableCell>{t.assignedAgentRole ?? "unassigned"}</TableCell>
              <TableCell>{EXECUTION_MODE_LABEL[t.mode]}</TableCell>
              <TableCell>
                <PriorityTag priority={t.priority} />
              </TableCell>
              <TableCell>
                <RiskClassTag risk={t.riskClass} />
              </TableCell>
              <TableCell>
                <TaskStatusBadge status={t.status} />
              </TableCell>
              <TableCell className="tabular-nums">#{t.attempt}</TableCell>
              {withControls ? (
                <TableCell>
                  <TaskActions task={t} />
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
