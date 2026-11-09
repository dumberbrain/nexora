import { useMutation, useQueryClient } from "@tanstack/react-query";

import { type AssignTaskInput, patchExecutionTask, taskApi, taskKeys } from "@/entities/task";

/** POST /executions/:id/tasks → append the created task to the board and refetch it. */
export function useAssignTask(executionId: string) {
  const qc = useQueryClient();
  const key = taskKeys.byExecution(executionId);
  return useMutation({
    mutationFn: (input: AssignTaskInput) => taskApi.assign(executionId, input),
    onSuccess: (task) => {
      qc.setQueryData(key, (old: Parameters<typeof patchExecutionTask>[0]) =>
        patchExecutionTask(old, task),
      );
      return qc.invalidateQueries({ queryKey: key });
    },
  });
}
