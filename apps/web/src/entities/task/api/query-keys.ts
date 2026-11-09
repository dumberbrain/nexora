import { ENTITY_ROOTS } from "@/shared/api";

import { type TaskBoardFilters } from "../model/types";

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
 *
 * US4 board:    board(filters) = GET /tasks?executionId=&projectId= (TaskList), under lists()
 *               so entity.changed refreshes it too. move-task → optimistic setQueryData on
 *               board(filters), rollback of that one task on error, then invalidate board(filters)
 *               + byExecution(executionId). Live `task.*` events invalidate board(filters) unless
 *               a move (mutationKey move()) is in flight — its own onSettled refetches.
 */
export const taskKeys = {
  all: [ENTITY_ROOTS.task] as const,
  lists: () => [...taskKeys.all, "list"] as const,
  byExecution: (executionId: string) => [...taskKeys.lists(), { executionId }] as const,
  boards: () => [...taskKeys.lists(), "board"] as const,
  board: (filters: TaskBoardFilters) => [...taskKeys.boards(), filters] as const,
  /** mutation key of the US4 board move */
  move: () => [...taskKeys.all, "move"] as const,
  details: () => [...taskKeys.all, "detail"] as const,
  detail: (id: string) => [...taskKeys.details(), id] as const,
};

export const TASK_CACHE = { staleTime: 10_000, gcTime: 10 * 60_000 } as const;
