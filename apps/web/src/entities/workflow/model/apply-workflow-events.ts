import { type NexoraEvent } from "@nexora/contracts";
import { type QueryClient } from "@tanstack/react-query";

import { type WorkflowRunDetail } from "./types";
import { workflowRunKeys } from "../api/query-keys";
import { applyNodeChanged, parseNodeChanged } from "../lib/node-run";

/**
 * Keep the cached workflow run of an execution live from its room's events: each
 * `workflow.node_changed` patches its node in place; run start/end, malformed payloads and
 * nodes not cached yet refetch GET /executions/:id/workflow-run (narrow invalidation).
 */
export function applyWorkflowEvents(
  qc: QueryClient,
  executionId: string,
  events: NexoraEvent[],
): Promise<void> {
  const workflowEvents = events.filter((e) => e.type.startsWith("workflow."));
  if (workflowEvents.length === 0) return Promise.resolve();
  const key = workflowRunKeys.byExecution(executionId);
  let refetch = false;
  for (const event of workflowEvents) {
    const change = parseNodeChanged(event);
    const cached = qc.getQueryData<WorkflowRunDetail>(key);
    if (!change || !cached) {
      refetch = true;
      continue;
    }
    const next = applyNodeChanged(cached, change);
    if (next.patched) qc.setQueryData(key, next.detail);
    else refetch = true;
  }
  return refetch ? qc.invalidateQueries({ queryKey: key }) : Promise.resolve();
}
