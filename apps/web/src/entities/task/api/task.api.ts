import { http } from "@/shared/api";

import {
  type AssignTaskInput,
  type ExecutionTasks,
  type MoveTaskInput,
  type RequestReviewInput,
  type Task,
  type TaskBoardFilters,
  type TaskControlInput,
  type TaskList,
  type TaskRef,
} from "../model/types";

type Opts = { signal?: AbortSignal };

const execPath = (executionId: string, sub = "") =>
  `/executions/${encodeURIComponent(executionId)}${sub}`;

/** `/tasks/:id/…` in rest-api.md is shorthand: task ids are unique per execution only. */
const taskPath = ({ executionId, taskId }: TaskRef, action: string) =>
  execPath(executionId, `/tasks/${encodeURIComponent(taskId)}/${action}`);

export const taskApi = {
  /** GET /executions/:id/tasks — the plan's tasks plus detected file conflicts */
  listByExecution: (executionId: string, opts: Opts = {}) =>
    http.get<ExecutionTasks>(execPath(executionId, "/tasks"), opts).then((r) => r.data),

  /** POST /executions/:id/tasks — assign an additional task → the created Task */
  assign: (executionId: string, input: AssignTaskInput) =>
    http.post<Task>(execPath(executionId, "/tasks"), input).then((r) => r.data),

  cancel: (ref: TaskRef, input: TaskControlInput = {}) =>
    http.post<Task>(taskPath(ref, "cancel"), input).then((r) => r.data),

  /** a new attempt linked to the previous one (`previousAttemptId`) */
  retry: (ref: TaskRef, input: TaskControlInput = {}) =>
    http.post<Task>(taskPath(ref, "retry"), input).then((r) => r.data),

  /** GET /tasks — the US4 board across executions, newest execution first */
  list: (filters: TaskBoardFilters, opts: Opts = {}) =>
    http.get<TaskList>("/tasks", { ...opts, params: filters }).then((r) => r.data),

  /** PATCH …/tasks/:id/status — user move, only pending ⇄ queued (else 409 with a reason) */
  move: (ref: TaskRef, input: MoveTaskInput) =>
    http.patch<Task>(taskPath(ref, "status"), input).then((r) => r.data),

  /** review by the Code Reviewer role */
  requestReview: (ref: TaskRef, input: RequestReviewInput = {}) =>
    http.post<Task>(taskPath(ref, "review"), input).then((r) => r.data),
};
