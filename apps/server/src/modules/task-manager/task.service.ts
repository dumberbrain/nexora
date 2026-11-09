import {
  type EventType,
  type ExecutionMode,
  type PlannedTask,
  type Severity,
  type Task,
  type TaskStatus,
} from "@nexora/contracts";

import { assertTaskTransition, isTerminalTask, validateDag } from "./task-state";
import { type TaskPatch, type TaskRepository } from "./task.repository";
import { AppError } from "../../http/errors";
import { type DomainEmitter } from "../event-manager/domain-emitter";

export interface TaskServiceDeps {
  repo: TaskRepository;
  emitter: DomainEmitter;
  now?: () => number;
}

export interface TransitionOptions {
  /** extra fields written with the status change */
  patch?: TaskPatch;
  /** persisted event for this change (task.started, task.failed, …); none when omitted */
  event?: { type: EventType; summary: string; severity?: Severity; payload?: unknown };
  sessionId?: string | null;
}

/**
 * Task manager (T095): plan persistence (DAG-validated), state-machine-checked transitions with
 * timestamps, attempts, changed files and test results, plus task events / entity patches.
 */
export class TaskService {
  private readonly now: () => number;

  constructor(private readonly deps: TaskServiceDeps) {
    this.now = deps.now ?? Date.now;
  }

  /** Store a fresh plan (ids T-1…T-n, status pending) and emit `task.created` for each task. */
  createPlan(executionId: string, mode: ExecutionMode, planned: readonly PlannedTask[]): Task[] {
    const tasks: Task[] = planned.map((p, i) => ({
      id: `T-${i + 1}`,
      executionId,
      title: p.title,
      description: p.description,
      assignedAgentRole: p.assignedAgentRole,
      agentId: null,
      mode,
      mechanismReason: p.mechanismReason,
      priority: p.priority,
      status: "pending",
      dependsOn: p.dependsOn,
      ownedPaths: p.ownedPaths,
      riskClass: p.riskClass,
      changedFiles: [],
      testResults: null,
      attempt: 1,
      previousAttemptId: null,
      startedAt: null,
      completedAt: null,
    }));
    validateDag(tasks);
    this.deps.repo.replacePlan(executionId, tasks);
    for (const t of tasks) {
      this.deps.emitter.event({
        type: "task.created",
        executionId,
        taskId: t.id,
        summary: `${t.id} created: ${t.title}`,
        payload: {
          title: t.title,
          role: t.assignedAgentRole,
          riskClass: t.riskClass,
          dependsOn: t.dependsOn,
          ownedPaths: t.ownedPaths,
        },
      });
      this.deps.emitter.entity("task", `${executionId}:${t.id}`, { ...t });
    }
    return tasks;
  }

  list(executionId: string): Task[] {
    return this.deps.repo.list(executionId);
  }

  get(executionId: string, id: string): Task {
    const t = this.deps.repo.get(executionId, id);
    if (!t) throw new AppError("NOT_FOUND", `Task ${id} not found`);
    return t;
  }

  /** Validated status change; returns the updated task. */
  transition(executionId: string, id: string, to: TaskStatus, opts: TransitionOptions = {}): Task {
    const current = this.get(executionId, id);
    assertTaskTransition(current.status, to);
    const now = this.now();
    const patch: TaskPatch = { ...opts.patch, status: to };
    if (to === "running" && current.startedAt === null) patch.startedAt = now;
    if (isTerminalTask(to)) patch.completedAt = now;
    this.deps.repo.update(executionId, id, patch);
    if (opts.event) {
      this.deps.emitter.event({
        type: opts.event.type,
        executionId,
        taskId: id,
        sessionId: opts.sessionId ?? null,
        severity: opts.event.severity ?? "info",
        summary: opts.event.summary,
        payload: opts.event.payload ?? { status: to },
      });
    }
    this.deps.emitter.entity("task", `${executionId}:${id}`, { id, executionId, ...patch });
    return { ...current, ...patch };
  }

  /** Non-status fields (e.g. changed files collected after the session ended). */
  update(executionId: string, id: string, patch: TaskPatch): void {
    this.deps.repo.update(executionId, id, patch);
    this.deps.emitter.entity("task", `${executionId}:${id}`, { id, executionId, ...patch });
  }
}
