import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  type MoveTaskInput,
  patchTaskList,
  type Task,
  type TaskBoardFilters,
  taskApi,
  taskKeys,
  type TaskList,
} from "@/entities/task";

interface MoveVars {
  task: Task;
  status: MoveTaskInput["status"];
}

/**
 * PATCH …/tasks/:id/status with an optimistic update of board(filters). On error only the moved
 * task is rolled back (other in-flight moves survive) and the server's reason (409) is toasted.
 */
export function useMoveTask(filters: TaskBoardFilters) {
  const qc = useQueryClient();
  const key = taskKeys.board(filters);
  return useMutation({
    mutationKey: taskKeys.move(),
    mutationFn: ({ task, status }: MoveVars) =>
      taskApi.move({ executionId: task.executionId, taskId: task.id }, { status }),
    onMutate: async ({ task, status }) => {
      await qc.cancelQueries({ queryKey: key });
      qc.setQueryData<TaskList>(key, (old) => patchTaskList(old, { ...task, status }));
    },
    onSuccess: (updated) => {
      qc.setQueryData<TaskList>(key, (old) => patchTaskList(old, updated));
    },
    onError: (error, { task }) => {
      qc.setQueryData<TaskList>(key, (old) => patchTaskList(old, task));
      toast.error(`Could not move ${task.id}`, { description: error.message });
    },
    onSettled: (_data, _error, { task }) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: key }),
        qc.invalidateQueries({ queryKey: taskKeys.byExecution(task.executionId) }),
      ]),
  });
}
