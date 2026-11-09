import { queryOptions } from "@tanstack/react-query";

import { TASK_CACHE, taskKeys } from "./query-keys";
import { taskApi } from "./task.api";
import { type TaskBoardFilters } from "../model/types";

export const executionTasksQuery = (executionId: string) =>
  queryOptions({
    queryKey: taskKeys.byExecution(executionId),
    queryFn: ({ signal }) => taskApi.listByExecution(executionId, { signal }),
    ...TASK_CACHE,
  });

/** US4 board: tasks across executions, optionally narrowed to one execution or project. */
export const taskBoardQuery = (filters: TaskBoardFilters) =>
  queryOptions({
    queryKey: taskKeys.board(filters),
    queryFn: ({ signal }) => taskApi.list(filters, { signal }),
    ...TASK_CACHE,
  });
