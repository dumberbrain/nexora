import { ENTITY_ROOTS } from "@/shared/api";

import { type WorkflowGraph } from "../model/types";

/**
 * Cache policy — workflows (US5 definitions + immutable versions)
 * owner:        US5 web
 * keys:         workflowKeys.* (["workflows", ...]) — all/lists()/detail(id) follow the
 *               shared/api/entity-keys convention; versions(id) and version(id, v) live under
 *               detail(id) so invalidating a definition refreshes its versions too
 * staleTime:    60 s for definitions/lists; versions are immutable → version(id, v) never stale
 * gcTime:       10 min
 * invalidation: create → setQueryData(detail(id)) + lists(); save version → setQueryData(
 *               version(id, v)) + invalidate detail(id) (latest + versions) and lists()
 * validation:   validate(graph) = POST /workflows/validate result for that exact graph
 *               (the graph is the key → identical drafts share one result), staleTime ∞
 */
export const workflowKeys = {
  all: ["workflows"] as const,
  lists: () => [...workflowKeys.all, "list"] as const,
  details: () => [...workflowKeys.all, "detail"] as const,
  detail: (id: string) => [...workflowKeys.details(), id] as const,
  versions: (id: string) => [...workflowKeys.detail(id), "versions"] as const,
  version: (id: string, version: number) => [...workflowKeys.versions(id), version] as const,
  validate: (graph: WorkflowGraph) => [...workflowKeys.all, "validate", graph] as const,
  /** mutation key of "save as new version" */
  save: (id: string) => [...workflowKeys.all, "save", id] as const,
};

/**
 * Cache policy — workflow runs (live overlay of an execution in mode `workflow`)
 * keys:         workflowRunKeys.byExecution(executionId) = GET /executions/:id/workflow-run
 * staleTime:    5 s   gcTime: 5 min
 * realtime:     the execution room's `workflow.node_changed` events patch the node in place
 *               (applyWorkflowEvents); `workflow.started|completed` and unknown nodes refetch
 */
export const workflowRunKeys = {
  all: [ENTITY_ROOTS.workflowRun] as const,
  byExecution: (executionId: string) => [...workflowRunKeys.all, "execution", executionId] as const,
};

export const WORKFLOW_CACHE = { staleTime: 60_000, gcTime: 10 * 60_000 } as const;
export const WORKFLOW_RUN_CACHE = { staleTime: 5_000, gcTime: 5 * 60_000 } as const;
