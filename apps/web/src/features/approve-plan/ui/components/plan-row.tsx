import { type ComponentProps } from "react";

import { EXECUTION_MODE_LABEL } from "@/entities/execution";
import { TaskStatusBadge } from "@/entities/status";
import { PriorityTag, RiskClassTag, type PlanConflict, type Task } from "@/entities/task";
import { cn } from "@/shared/lib/cn";
import { TableCell, TableRow } from "@/shared/ui/table";

interface PlanRowProps {
  task: Task;
  conflicts: PlanConflict[];
  /** register("approveRiskyTaskIds") — only rendered for risky tasks */
  approveInput: Omit<ComponentProps<"input">, "type" | "value">;
}

const MUTED = "text-muted-foreground";

/** One plan task (US2-AS4) with its conflict flag (FR-007) and risky-task approval (FR-033). */
export function PlanRow({ task, conflicts, approveInput }: PlanRowProps) {
  const others = conflicts.flatMap((c) => c.taskIds.filter((id) => id !== task.id));
  const risky = task.riskClass !== "normal";
  return (
    <TableRow
      data-conflict={conflicts.length > 0}
      className={cn("align-top font-mono text-xs", conflicts.length > 0 && "bg-status-paused/5")}
    >
      <TableCell className="text-phosphor">{task.id}</TableCell>
      <TableCell className="max-w-72 whitespace-normal">
        <span className="block text-foreground">{task.title}</span>
        <span className={cn("block", MUTED)}>{task.description}</span>
        {others.length > 0 ? (
          <span className="mt-1 inline-block border border-status-paused/60 px-1.5 py-0.5 text-[10px] text-status-paused uppercase">
            conflicts with {others.join(", ")}
          </span>
        ) : null}
      </TableCell>
      <TableCell>{task.assignedAgentRole ?? <span className={MUTED}>unassigned</span>}</TableCell>
      <TableCell>{EXECUTION_MODE_LABEL[task.mode]}</TableCell>
      <TableCell>
        {task.dependsOn.length > 0 ? (
          task.dependsOn.join(", ")
        ) : (
          <span className={MUTED}>none</span>
        )}
      </TableCell>
      <TableCell>
        <PriorityTag priority={task.priority} />
      </TableCell>
      <TableCell>
        <TaskStatusBadge status={task.status} />
      </TableCell>
      <TableCell className="max-w-48 break-all whitespace-normal">
        {task.ownedPaths.join(", ")}
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1.5">
          <RiskClassTag risk={task.riskClass} />
          {risky ? (
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                value={task.id}
                aria-label={`approve risky task ${task.id}`}
                className="accent-(--phosphor)"
                {...approveInput}
              />
              <span aria-hidden="true">approve</span>
            </label>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
