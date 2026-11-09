import { type NexoraEvent, WorkflowNodeChangedPayloadSchema } from "@nexora/contracts";

import {
  type NodeRunStatus,
  type WorkflowNodeChangedPayload,
  type WorkflowRunDetail,
} from "../model/types";

/** `workflow.node_changed` payload, or null for any other / malformed event. */
export function parseNodeChanged(event: NexoraEvent): WorkflowNodeChangedPayload | null {
  if (event.type !== "workflow.node_changed") return null;
  const parsed = WorkflowNodeChangedPayloadSchema.safeParse(event.payload);
  return parsed.success ? parsed.data : null;
}

/**
 * Patch the latest attempt of one node in a cached run. A new attempt clears the previous
 * attempt's output/error. `patched: false` means the node run is not cached yet → refetch.
 */
export function applyNodeChanged(
  detail: WorkflowRunDetail,
  change: WorkflowNodeChangedPayload,
): { detail: WorkflowRunDetail; patched: boolean } {
  if (detail.run.id !== change.runId) return { detail, patched: false };
  const index = detail.nodes.findIndex((n) => n.nodeId === change.nodeId);
  const current = detail.nodes[index];
  if (!current) return { detail, patched: false };
  const fresh = change.attempt !== current.attempt;
  const nodes = detail.nodes.slice();
  nodes[index] = {
    ...current,
    attempt: change.attempt,
    status: change.status,
    ...(fresh ? { outputSummary: null, error: null, sessionId: null } : {}),
  };
  return { detail: { ...detail, nodes }, patched: true };
}

export const NODE_RUN_STATUS_LABEL: Record<NodeRunStatus, string> = {
  pending: "Pending",
  running: "Running",
  waiting_for_approval: "Waiting for approval",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  skipped: "Skipped",
};
