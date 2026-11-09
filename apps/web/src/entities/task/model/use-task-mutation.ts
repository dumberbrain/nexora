import { useMutation, useQueryClient } from "@tanstack/react-query";

import { type Task, type TaskRef } from "./types";
import { taskKeys } from "../api/query-keys";
import { patchExecutionTask } from "../lib/patch-task";

/**
 * Shared shape of every US3 task control (cancel / retry / review): call `run`, then patch the
 * returned Task into byExecution(executionId) and refetch it so dependants update too.
 */
export function useTaskMutation<V>(ref: TaskRef, run: (ref: TaskRef, vars: V) => Promise<Task>) {
  const qc = useQueryClient();
  const key = taskKeys.byExecution(ref.executionId);
  return useMutation({
    mutationFn: (vars: V) => run(ref, vars),
    onSuccess: (task) => {
      qc.setQueryData(key, (old: Parameters<typeof patchExecutionTask>[0]) =>
        patchExecutionTask(old, task),
      );
      return qc.invalidateQueries({ queryKey: key });
    },
  });
}
