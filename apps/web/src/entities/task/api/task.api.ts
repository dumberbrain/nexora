import { http } from "@/shared/api";

import { type ExecutionTasks } from "../model/types";

type Opts = { signal?: AbortSignal };

export const taskApi = {
  /** GET /executions/:id/tasks — the plan's tasks plus detected file conflicts */
  listByExecution: (executionId: string, opts: Opts = {}) =>
    http
      .get<ExecutionTasks>(`/executions/${encodeURIComponent(executionId)}/tasks`, opts)
      .then((r) => r.data),
};
