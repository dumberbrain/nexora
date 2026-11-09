import { type Active, type Announcements, type Over } from "@dnd-kit/core";
import { boardColumnOf } from "@nexora/contracts";

import { BOARD_COLUMN_LABEL, type BoardColumn, type Task } from "@/entities/task";
import { decideMove } from "@/features/move-task";

/** Data every draggable card carries (useDraggable `data`). */
export interface CardDragData {
  task: Task;
}

export const taskOfActive = (active: Active | null): Task | undefined =>
  (active?.data.current as CardDragData | undefined)?.task;

export const columnOfOver = (over: Over | null): BoardColumn | undefined =>
  over ? (over.id as BoardColumn) : undefined;

export const SCREEN_READER_INSTRUCTIONS = {
  draggable:
    "To pick up a task, press Space or Enter. Use the Left and Right arrow keys to move it between columns — only Backlog and Todo accept a drop. Press Space or Enter again to drop it, or Escape to cancel.",
};

const label = (task: Task) => BOARD_COLUMN_LABEL[boardColumnOf(task.status)];

/** Screen-reader announcements in board terms (task id + column title, allowed or refused). */
export const BOARD_ANNOUNCEMENTS: Announcements = {
  onDragStart: ({ active }) => {
    const task = taskOfActive(active);
    return task ? `Picked up ${task.id} ${task.title} from ${label(task)}.` : undefined;
  },
  onDragOver: ({ active, over }) => {
    const task = taskOfActive(active);
    const to = columnOfOver(over);
    if (!task) return undefined;
    if (!to) return `${task.id} is not over a column.`;
    const decision = decideMove(task, to);
    // over its own column right after pick-up: keep the pick-up announcement audible
    if (decision.kind === "same") return undefined;
    const verdict = decision.kind === "move" ? "drop allowed" : "drop refused";
    return `${task.id} is over ${BOARD_COLUMN_LABEL[to]} — ${verdict}.`;
  },
  onDragEnd: ({ active, over }) => {
    const task = taskOfActive(active);
    const to = columnOfOver(over);
    if (!task) return undefined;
    if (!to) return `${task.id} was dropped outside the board and stays in ${label(task)}.`;
    const decision = decideMove(task, to);
    if (decision.kind === "move") return `${task.id} moved to ${BOARD_COLUMN_LABEL[to]}.`;
    if (decision.kind === "same") return `${task.id} stays in ${label(task)}.`;
    return `${task.id} was not moved — ${BOARD_COLUMN_LABEL[to]} refused the drop.`;
  },
  onDragCancel: ({ active }) => {
    const task = taskOfActive(active);
    return task ? `Move cancelled. ${task.id} stays in ${label(task)}.` : undefined;
  },
};
