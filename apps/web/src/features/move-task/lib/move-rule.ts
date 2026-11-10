import { boardColumnOf, USER_MOVABLE_STATUSES } from "@ubuliera/contracts";

import {
  BOARD_COLUMN_LABEL,
  type BoardColumn,
  type MoveTaskInput,
  type Task,
} from "@/entities/task";

type MovableStatus = MoveTaskInput["status"];

/** The only user moves (data-model.md "Task transitions"): Backlog ⇄ Todo = pending ⇄ queued. */
const STATUS_OF_COLUMN: Partial<Record<BoardColumn, MovableStatus>> = {
  backlog: "pending",
  todo: "queued",
};

const MOVABLE = new Set<string>(USER_MOVABLE_STATUSES);

/** Why a card cannot be picked up at all, or null when it can. */
export function dragBlockedReason(task: Pick<Task, "status">): string | null {
  return MOVABLE.has(task.status)
    ? null
    : "Only Backlog and Todo cards can be dragged — the rest move as agents work.";
}

export type MoveDecision =
  { kind: "same" } | { kind: "refused"; reason: string } | { kind: "move"; status: MovableStatus };

/** Client-side guard before the PATCH; the server stays authoritative (409 with a reason). */
export function decideMove(task: Pick<Task, "status">, to: BoardColumn): MoveDecision {
  const blocked = dragBlockedReason(task);
  if (blocked) return { kind: "refused", reason: blocked };
  if (boardColumnOf(task.status) === to) return { kind: "same" };
  const status = STATUS_OF_COLUMN[to];
  if (!status) {
    return {
      kind: "refused",
      reason: `Only Backlog ⇄ Todo moves are allowed — ${BOARD_COLUMN_LABEL[to]} is reached by agents, not by dragging.`,
    };
  }
  return { kind: "move", status };
}
