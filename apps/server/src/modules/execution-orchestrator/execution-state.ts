import { type ExecutionStatus } from "@ubuliera/contracts";

import { AppError } from "../../http/errors";

/**
 * Execution state machine (data-model.md): draft → analyzing → awaiting_mode → configuring →
 * plan_ready → awaiting_approval → running ⇄ paused → verifying → completed | failed | cancelled.
 * Additions: any non-terminal state may be cancelled; analysis, run and verification may fail;
 * a plan that is not approved yet can go back to configuring (re-plan).
 */
export const EXECUTION_TRANSITIONS: Readonly<Record<ExecutionStatus, readonly ExecutionStatus[]>> =
  {
    draft: ["analyzing", "cancelled"],
    analyzing: ["awaiting_mode", "failed", "cancelled"],
    awaiting_mode: ["configuring", "cancelled"],
    configuring: ["plan_ready", "cancelled"],
    plan_ready: ["awaiting_approval", "configuring", "cancelled"],
    awaiting_approval: ["running", "configuring", "cancelled"],
    running: ["paused", "verifying", "failed", "cancelled"],
    paused: ["running", "cancelled"],
    verifying: ["completed", "failed", "cancelled"],
    completed: [],
    failed: [],
    cancelled: [],
  };

export function isTerminalExecution(status: ExecutionStatus): boolean {
  return EXECUTION_TRANSITIONS[status].length === 0;
}

export function canTransitionExecution(from: ExecutionStatus, to: ExecutionStatus): boolean {
  return EXECUTION_TRANSITIONS[from].includes(to);
}

/** Throws CONFLICT (409) for any transition the state machine does not allow. */
export function assertExecutionTransition(from: ExecutionStatus, to: ExecutionStatus): void {
  if (!canTransitionExecution(from, to)) {
    throw new AppError("CONFLICT", `Execution cannot go from ${from} to ${to}`);
  }
}
