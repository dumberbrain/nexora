import { type NexoraEvent } from "@nexora/contracts";
import { type QueryClient } from "@tanstack/react-query";

import { executionDetailQuery, executionKeys } from "@/entities/execution";
import { executionTasksQuery, taskKeys } from "@/entities/task";

/** Route loader: the execution and its tasks in parallel (prefetch — errors show in the view). */
export function loadExecution(qc: QueryClient, executionId: string) {
  return Promise.all([
    qc.prefetchQuery(executionDetailQuery(executionId)),
    qc.prefetchQuery(executionTasksQuery(executionId)),
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
  return Promise.all(jobs);
}
