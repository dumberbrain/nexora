import { type ExecutionTasks, type Task } from "../model/types";

/**
 * Apply a control's returned Task to the cached `byExecution` list: replace by id, or append a
 * task the list does not hold yet (an assigned task, or a retry attempt with a new id).
 */
export function patchExecutionTask(
  old: ExecutionTasks | undefined,
  task: Task,
): ExecutionTasks | undefined {
  if (!old) return old;
  const known = old.items.some((t) => t.id === task.id);
  return {
    ...old,
    items: known ? old.items.map((t) => (t.id === task.id ? task : t)) : [...old.items, task],
  };
}
