import { type ExecutionStatus, type TaskStatus } from "@ubuliera/contracts";

/** Exact task status names from US2-AS6 — each one stays distinguishable by its text. */
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "Pending",
  queued: "Queued",
  planning: "Planning",
  running: "Running",
  waiting_for_input: "Waiting for input",
  blocked: "Blocked",
  reviewing: "Reviewing",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const EXECUTION_STATUS_LABEL: Record<ExecutionStatus, string> = {
  draft: "Draft",
  analyzing: "Analyzing",
  awaiting_mode: "Awaiting mode",
  configuring: "Configuring",
  plan_ready: "Plan ready",
  awaiting_approval: "Awaiting approval",
  running: "Running",
  paused: "Paused",
  verifying: "Verifying",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};
