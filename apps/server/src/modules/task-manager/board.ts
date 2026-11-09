import {
  type Execution,
  type ExecutionStatus,
  type MoveTaskInput,
  MoveTaskInputSchema,
  type Task,
  type TaskList,
  type TaskListQuery,
  type TaskRef,
  type TaskStatus,
  USER_MOVABLE_STATUSES,
} from "@nexora/contracts";

import { type TaskService } from "./task.service";
import { AppError } from "../../http/errors";
import { type ApprovalService } from "../permission-manager/approval.service";
import { type AuditService } from "../permission-manager/audit.service";

type Movable = MoveTaskInput["status"];

const isMovable = (s: TaskStatus): s is Movable =>
  (USER_MOVABLE_STATUSES as readonly TaskStatus[]).includes(s);

/** Why a target status can never be set by a user (the system owns these transitions). */
const SYSTEM_TARGET: Partial<Record<TaskStatus, string>> = {
  planning: "the scheduler starts queued tasks once their dependencies are done and a slot is free",
  running: "the scheduler starts queued tasks once their dependencies are done and a slot is free",
  waiting_for_input: "a task waits for input only when its agent asks for it",
  blocked: "a task is blocked only by its agent",
  reviewing: "tasks enter review when their agent hands in its work",
  completed: "tasks complete when their agent finishes",
  failed: "tasks fail only when their agent fails",
  cancelled: "use Cancel on the task instead",
};

/** Why a task in this status can no longer be moved by a user. */
const SYSTEM_SOURCE: Partial<Record<TaskStatus, string>> = {
  planning: "the task is already with its agent; cancel it instead",
  running: "the task is already with its agent; cancel it instead",
  waiting_for_input: "the task is already with its agent; cancel it instead",
  blocked: "the task is already with its agent; cancel it instead",
  reviewing: "the task is already with its agent; cancel it instead",
  completed: "completed tasks are final",
  failed: "failed tasks are final; retry creates a new attempt",
  cancelled: "cancelled tasks are final; retry creates a new attempt",
};

/**
 * Board drag rule (US4, data-model.md "Task transitions"): the only user move is
 * Backlog ⇄ Todo (`pending ⇄ queued`); a drop on the same status is no move. Returns the
 * human-readable refusal reason, or null when the move is allowed.
 */
export function userMoveRefusal(from: TaskStatus, to: TaskStatus): string | null {
  if (from === to) return null;
  const why = isMovable(to) ? (isMovable(from) ? null : SYSTEM_SOURCE[from]) : SYSTEM_TARGET[to];
  return why === null ? null : `${from} → ${to} is not a user move; ${why ?? "not allowed"}`;
}

/** Throws CONFLICT with the reason unless `from → to` is a user move. */
export function assertUserMove(from: TaskStatus, to: TaskStatus): asserts to is Movable {
  const reason = userMoveRefusal(from, to);
  if (reason !== null || !MoveTaskInputSchema.safeParse({ status: to }).success) {
    throw new AppError("CONFLICT", reason ?? `${to} is not a board column a user can set`);
  }
}

/** Executions whose tasks a user may still move (before approval the plan queues them itself). */
const MOVABLE_IN: ReadonlySet<ExecutionStatus> = new Set(["running", "paused"]);
const AFTER_RUN: ReadonlySet<ExecutionStatus> = new Set([
  "verifying",
  "completed",
  "failed",
  "cancelled",
]);

export interface BoardDeps {
  orchestrator: {
    get(id: string): Execution;
    /** newest execution first */
    list(q?: { projectId?: string }): Execution[];
    /** the execution's serial chain, shared with the scheduler */
    exclusive<T>(id: string, fn: () => Promise<T> | T): Promise<T>;
    schedule(id: string): void;
  };
  tasks: Pick<TaskService, "get" | "list" | "transition">;
  approvals: Pick<ApprovalService, "approvedTaskIds">;
  audit: Pick<AuditService, "record">;
}

/**
 * Task board (T120): user moves between Backlog and Todo and the cross-execution task list.
 * A move runs on the orchestrator's per-execution chain, so it never races the scheduler picking
 * up a queued task; moving to Todo asks for a scheduling round so the task can start right away.
 * The status change goes through TaskService.transition, which publishes the `task`
 * entity.changed patch that keeps every open board live.
 */
export class BoardService {
  constructor(private readonly deps: BoardDeps) {}

  async move(ref: TaskRef, to: TaskStatus, actor: string): Promise<Task> {
    const { executionId, taskId } = ref;
    const base = {
      actor,
      action: "task.move",
      targetType: "task",
      targetId: `${executionId}:${taskId}`,
    };
    let from: TaskStatus | null = null;
    try {
      const moved = await this.deps.orchestrator.exclusive(executionId, () => {
        const e = this.deps.orchestrator.get(executionId);
        const t = this.deps.tasks.get(executionId, taskId);
        from = t.status;
        assertUserMove(t.status, to);
        if (!MOVABLE_IN.has(e.status)) {
          throw new AppError(
            "CONFLICT",
            AFTER_RUN.has(e.status)
              ? `Execution is ${e.status}; its tasks can no longer change`
              : `Execution is ${e.status}; tasks can be moved once its plan is approved`,
          );
        }
        if (t.status === to) return { task: t, changed: false };
        if (
          to === "queued" &&
          t.riskClass !== "normal" &&
          !this.deps.approvals.approvedTaskIds(executionId).has(t.id)
        ) {
          throw new AppError(
            "CONFLICT",
            `${t.id} is ${t.riskClass} and waits for approval; approve it in the inbox to queue it`,
          );
        }
        return { task: this.deps.tasks.transition(executionId, t.id, to), changed: true };
      });
      if (moved.changed && to === "queued") this.deps.orchestrator.schedule(executionId);
      this.deps.audit.record({ ...base, outcome: "success", details: { from, to } });
      return moved.task;
    } catch (err) {
      this.deps.audit.record({
        ...base,
        outcome: err instanceof AppError ? "denied" : "failed",
        details: { from, to, reason: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  }

  /** Tasks across executions, newest execution first (tasks in plan order within one). */
  list(q: TaskListQuery): TaskList {
    const o = this.deps.orchestrator;
    let executions: Execution[];
    if (q.executionId) {
      const e = o.get(q.executionId);
      executions = q.projectId && e.projectId !== q.projectId ? [] : [e];
    } else {
      executions = o.list(q.projectId ? { projectId: q.projectId } : {});
    }
    const items: Task[] = [];
    for (const e of executions) {
      if (items.length >= q.limit) break;
      items.push(...this.deps.tasks.list(e.id).slice(0, q.limit - items.length));
    }
    return { items };
  }
}

export function createBoard(deps: BoardDeps): BoardService {
  return new BoardService(deps);
}
