import { type ComponentProps } from "react";

import { conflictsByTask, type ExecutionTasks } from "@/entities/task";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/shared/ui/table";

import { PlanRow } from "./plan-row";

const COLUMNS = [
  "ID",
  "Task",
  "Agent",
  "Mode",
  "Depends on",
  "Priority",
  "Status",
  "Owned paths",
  "Risk",
];

interface PlanTableProps {
  plan: ExecutionTasks;
  approveInput: Omit<ComponentProps<"input">, "type" | "value">;
}

/** The structured plan (FR-006) — every task with all its planning fields. */
export function PlanTable({ plan, approveInput }: PlanTableProps) {
  const conflicts = conflictsByTask(plan.conflicts);
  return (
    <div className="overflow-x-auto border border-border bg-card">
      <Table>
        <caption className="sr-only">Execution plan</caption>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((c) => (
              <TableHead key={c} className="font-mono text-[10px] tracking-widest uppercase">
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {plan.items.map((t) => (
            <PlanRow
              key={t.id}
              task={t}
              conflicts={conflicts.get(t.id) ?? []}
              approveInput={approveInput}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
