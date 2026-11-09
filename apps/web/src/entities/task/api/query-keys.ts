import { ENTITY_ROOTS } from "@/shared/api";

/**
 * Cache policy — tasks (an execution's plan / board)
 * owner:        US2 web (orchestration)
 * keys:         taskKeys.* (["tasks", ...]) — all/lists()/detail(id) follow the
 *               shared/api/entity-keys convention; byExecution(id) lives under lists()
 *               and holds the whole ExecutionTasks payload ({ items, conflicts })
 * staleTime:    10 s   gcTime: 10 min  (statuses change constantly while running)
 * invalidation: generate plan → setQueryData(byExecution(id)); approve → invalidate it;
 *               US3 cancel/retry/review/assign → patchExecutionTask(byExecution(id)) + invalidate
 * realtime:     socket `entity.changed` kind=task invalidates lists() → byExecution refetches;
 *               the execution view also invalidates it on live `task.*` events
 */
export const taskKeys = {
  all: [ENTITY_ROOTS.task] as const,
  lists: () => [...taskKeys.all, "list"] as const,
  byExecution: (executionId: string) => [...taskKeys.lists(), { executionId }] as const,
  details: () => [...taskKeys.all, "detail"] as const,
  detail: (id: string) => [...taskKeys.details(), id] as const,
};

export const TASK_CACHE = { staleTime: 10_000, gcTime: 10 * 60_000 } as const;
