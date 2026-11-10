import {
  DEFAULT_MAX_PARALLEL_SESSIONS,
  MAX_PARALLEL_SESSIONS,
  type PlanConflict,
  type Priority,
  type Task,
} from "@ubuliera/contracts";

import { ACTIVE_TASK_STATUSES } from "../task-manager/task-state";

export interface ScheduleInput {
  tasks: readonly Task[];
  conflicts: readonly PlanConflict[];
  /** task ids whose risky-task ApprovalRequest was approved by a human */
  approvedRiskyTaskIds: ReadonlySet<string>;
  /** default 4, never more than 8 */
  maxParallelSessions?: number;
  /** ExecutionConfig.parallelism === "sequential" */
  sequential?: boolean;
}

export interface ScheduledStart {
  taskId: string;
  /** "task" = own worktree because of a separate_worktrees conflict (R5) */
  workspace: "execution" | "task";
}

export function clampParallel(n: number | undefined): number {
  if (n === undefined || !Number.isFinite(n)) return DEFAULT_MAX_PARALLEL_SESSIONS;
  return Math.min(MAX_PARALLEL_SESSIONS, Math.max(1, Math.floor(n)));
}

const PRIORITY_RANK: Record<Priority, number> = { p1: 0, p2: 1, p3: 2 };
const taskNumber = (id: string) => Number(id.slice(2)) || 0;

function byPriority(a: Task, b: Task): number {
  return (
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || taskNumber(a.id) - taskNumber(b.id)
  );
}

/**
 * Pure scheduling decision: which queued tasks start now. A task starts only when it is queued,
 * all dependencies completed, it is not risky — or its approval was granted (FR-033) — a slot is
 * free, and no serialised conflict partner is active or starting in the same round.
 */
export function nextStarts(input: ScheduleInput): ScheduledStart[] {
  const limit = input.sequential ? 1 : clampParallel(input.maxParallelSessions);
  const status = new Map(input.tasks.map((t) => [t.id, t.status]));
  const busy = new Set(
    input.tasks.filter((t) => ACTIVE_TASK_STATUSES.has(t.status)).map((t) => t.id),
  );
  let free = limit - busy.size;
  const serialisedWith = new Map<string, string[]>();
  const ownWorktree = new Set<string>();
  for (const c of input.conflicts) {
    const [a, b] = c.taskIds;
    if (c.resolution === "separate_worktrees") {
      ownWorktree.add(a);
      ownWorktree.add(b);
      continue;
    }
    serialisedWith.set(a, [...(serialisedWith.get(a) ?? []), b]);
    serialisedWith.set(b, [...(serialisedWith.get(b) ?? []), a]);
  }

  const starts: ScheduledStart[] = [];
  for (const t of [...input.tasks].sort(byPriority)) {
    if (free <= 0) break;
    if (t.status !== "queued") continue;
    if (t.riskClass !== "normal" && !input.approvedRiskyTaskIds.has(t.id)) continue;
    if (!t.dependsOn.every((d) => status.get(d) === "completed")) continue;
    if ((serialisedWith.get(t.id) ?? []).some((other) => busy.has(other))) continue;
    starts.push({ taskId: t.id, workspace: ownWorktree.has(t.id) ? "task" : "execution" });
    busy.add(t.id);
    free -= 1;
  }
  return starts;
}

/** Not-yet-started tasks that can never run because a (transitive) dependency failed/cancelled. */
export function unreachableTasks(tasks: readonly Task[]): string[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const dead = new Set(
    tasks.filter((t) => t.status === "failed" || t.status === "cancelled").map((t) => t.id),
  );
  const out: string[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of tasks) {
      if (dead.has(t.id) || (t.status !== "pending" && t.status !== "queued")) continue;
      if (t.dependsOn.some((d) => dead.has(d) || !byId.has(d))) {
        dead.add(t.id);
        out.push(t.id);
        changed = true;
      }
    }
  }
  return out;
}
