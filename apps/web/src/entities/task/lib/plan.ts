import { type PlanConflict, type Task } from "../model/types";

/** Tasks that need an explicit human approval before they may run (FR-033). */
export function riskyTasks(tasks: readonly Task[]): Task[] {
  return tasks.filter((t) => t.riskClass !== "normal");
}

/** Task id → the conflicts it takes part in (FR-007). */
export function conflictsByTask(conflicts: readonly PlanConflict[]): Map<string, PlanConflict[]> {
  const map = new Map<string, PlanConflict[]>();
  for (const c of conflicts) {
    for (const id of c.taskIds) map.set(id, [...(map.get(id) ?? []), c]);
  }
  return map;
}
