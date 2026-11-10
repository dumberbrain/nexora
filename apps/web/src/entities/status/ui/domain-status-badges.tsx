import { type ExecutionStatus, type TaskStatus } from "@ubuliera/contracts";

import { StatusBadge } from "./status-badge";
import { toStatusKind } from "../model/status-kind";
import { EXECUTION_STATUS_LABEL, TASK_STATUS_LABEL } from "../model/status-labels";

interface Props<S> {
  status: S;
  className?: string;
}

/** Task status: shared colour family + the exact task status name (US2-AS6, FR-032). */
export function TaskStatusBadge({ status, className }: Props<TaskStatus>) {
  return (
    <StatusBadge
      kind={toStatusKind(status)}
      label={TASK_STATUS_LABEL[status]}
      {...(className ? { className } : {})}
    />
  );
}

/** Execution lifecycle status with its exact name. */
export function ExecutionStatusBadge({ status, className }: Props<ExecutionStatus>) {
  return (
    <StatusBadge
      kind={toStatusKind(status)}
      label={EXECUTION_STATUS_LABEL[status]}
      {...(className ? { className } : {})}
    />
  );
}
