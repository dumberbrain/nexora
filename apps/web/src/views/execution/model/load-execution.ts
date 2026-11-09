import { type NexoraEvent } from "@nexora/contracts";
import { type QueryClient } from "@tanstack/react-query";

import { executionDetailQuery, executionKeys } from "@/entities/execution";
import { sessionKeys, sessionListQuery } from "@/entities/session";
import { executionTasksQuery, taskKeys } from "@/entities/task";
import { applyWorkflowEvents } from "@/entities/workflow";

/**
 * Route loader: the execution, its tasks and its sessions (whose capabilities drive the controls)
 * in parallel (prefetch — errors show in the view).
 */
export function loadExecution(qc: QueryClient, executionId: string) {
  return Promise.all([
    qc.prefetchQuery(executionDetailQuery(executionId)),
    qc.prefetchQuery(executionTasksQuery(executionId)),
    qc.prefetchQuery(sessionListQuery({ executionId })),
  ]);
}

/**
 * Live `task.*` events change task statuses; `session.*` / `error` events can move the
 * execution itself. Refresh exactly the affected keys (team standard: narrow invalidation).
 */
export function refreshOnEvents(qc: QueryClient, executionId: string, events: NexoraEvent[]) {
  const jobs: Promise<void>[] = [];
  if (events.some((e) => e.type.startsWith("task."))) {
    jobs.push(qc.invalidateQueries({ queryKey: taskKeys.byExecution(executionId) }));
  }
  if (events.some((e) => !e.type.startsWith("tool.") && !e.type.startsWith("file."))) {
    jobs.push(qc.invalidateQueries({ queryKey: executionKeys.detail(executionId), exact: true }));
  }
  // sessions start/stop during a run — their capabilities decide which controls are enabled
  if (events.some((e) => e.type.startsWith("session."))) {
    jobs.push(qc.invalidateQueries({ queryKey: sessionKeys.list({ executionId }) }));
  }
  // workflow mode: node_changed patches the run overlay in place; start/end refetch it
  jobs.push(applyWorkflowEvents(qc, executionId, events));
  return Promise.all(jobs);
}
