import { BOARD_COLUMNS, boardColumnOf } from "@ubuliera/contracts";

import { type BoardColumn, type Task, type TaskList } from "../model/types";

/** Column titles (US4) — also the accessible names of the column lists. */
export const BOARD_COLUMN_LABEL: Record<BoardColumn, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  review: "Review",
  completed: "Completed",
  failed: "Failed",
};

/** Task ids are unique per execution only — a board across executions needs both. */
export const taskCardId = (t: Pick<Task, "executionId" | "id">): string =>
  `${t.executionId}:${t.id}`;

/** Group tasks into the six columns, keeping server order inside each column. */
export function groupByColumn(tasks: readonly Task[]): Record<BoardColumn, Task[]> {
  const grouped = Object.fromEntries(BOARD_COLUMNS.map((c) => [c, [] as Task[]])) as Record<
    BoardColumn,
    Task[]
  >;
  for (const t of tasks) grouped[boardColumnOf(t.status)].push(t);
  return grouped;
}

/** Replace one task (matched by execution + id) in a cached board list. */
export function patchTaskList(old: TaskList | undefined, task: Task): TaskList | undefined {
  if (!old) return old;
  const id = taskCardId(task);
  return { ...old, items: old.items.map((t) => (taskCardId(t) === id ? task : t)) };
}
