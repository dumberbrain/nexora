import { queryOptions } from "@tanstack/react-query";

import { TASK_CACHE, taskKeys } from "./query-keys";
import { taskApi } from "./task.api";

export const executionTasksQuery = (executionId: string) =>
  queryOptions({
    queryKey: taskKeys.byExecution(executionId),
    queryFn: ({ signal }) => taskApi.listByExecution(executionId, { signal }),
    ...TASK_CACHE,
  });
