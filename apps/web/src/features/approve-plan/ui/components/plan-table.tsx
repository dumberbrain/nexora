import { type ComponentProps } from "react";

import { conflictsByTask, type ExecutionTasks } from "@/entities/task";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/shared/ui/table";

import { PlanRow } from "./plan-row";

const BEFORE_MODE = ["ID", "Task", "Agent"];
const AFTER_MODE = ["Depends on", "Priority", "Status", "Owned paths", "Risk"];

/** A hybrid plan (US6) mixes mechanisms per task — show each one and the planner's reason. */
const columnsFor = (hybrid: boolean) => [
  ...BEFORE_MODE,
  ...(hybrid ? ["Mechanism", "Reason"] : ["Mode"]),
  ...AFTER_MODE,
];

interface PlanTableProps {
  plan: ExecutionTasks;
  /** the execution runs in hybrid mode */
  hybrid: boolean;
  approveInput: Omit<ComponentProps<"input">, "type" | "value">;
}

/** The structured plan (FR-006) — every task with all its planning fields. */
export function PlanTable({ plan, hybrid, approveInput }: PlanTableProps) {
  const conflicts = conflictsByTask(plan.conflicts);
  return (
    <div className="overflow-x-auto border border-border bg-card">
      <Table>
        <caption className="sr-only">Execution plan</caption>
        <TableHeader>
          <TableRow>
            {columnsFor(hybrid).map((c) => (
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
              hybrid={hybrid}
              approveInput={approveInput}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
