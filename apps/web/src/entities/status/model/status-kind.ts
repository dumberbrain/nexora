import {
  type AgentStatus,
  type ExecutionStatus,
  type SessionStatus,
  type TaskStatus,
} from "@ubuliera/contracts";

/** Visual status vocabulary shared by every view (FR-032). */
export type StatusKind =
  | "running"
  | "idle"
  | "paused"
  | "waiting"
  | "pending"
  | "stopped"
  | "failed"
  | "completed"
  | "unresponsive"
  | "unknown";

export const STATUS_LABEL: Record<StatusKind, string> = {
  running: "Running",
  idle: "Idle",
  paused: "Paused",
  waiting: "Waiting for approval",
  pending: "Pending",
  stopped: "Stopped",
  failed: "Failed",
  completed: "Completed",
  unresponsive: "Unresponsive",
  unknown: "Unknown",
};

type AnyStatus = SessionStatus | AgentStatus | TaskStatus | ExecutionStatus;

const MAP: Record<AnyStatus, StatusKind> = {
  // session
  starting: "pending",
  running: "running",
  idle: "idle",
  waiting_for_approval: "waiting",
  paused: "paused",
  unresponsive: "unresponsive",
  stopped: "stopped",
  failed: "failed",
  unknown: "unknown",
  // agent
  spawning: "pending",
  waiting: "waiting",
  completed: "completed",
  // task
  pending: "pending",
  queued: "pending",
  planning: "running",
  waiting_for_input: "waiting",
  blocked: "paused",
  reviewing: "running",
  cancelled: "stopped",
  // execution
  draft: "pending",
  analyzing: "running",
  awaiting_mode: "waiting",
  configuring: "waiting",
  plan_ready: "waiting",
  awaiting_approval: "waiting",
  verifying: "running",
};

export function toStatusKind(status: AnyStatus): StatusKind {
  return MAP[status];
}
