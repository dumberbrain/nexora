import { type StatusKind } from "@/entities/status";
import { type NodeRunStatus } from "@/entities/workflow";

const KIND: Record<NodeRunStatus, StatusKind> = {
  pending: "pending",
  running: "running",
  waiting_for_approval: "waiting",
  completed: "completed",
  failed: "failed",
  cancelled: "stopped",
  skipped: "stopped",
};

/** Node-run status → the shared status vocabulary (colour + icon + text, FR-032). */
export const nodeRunStatusKind = (status: NodeRunStatus): StatusKind => KIND[status];
