export type {
  AssignTaskInput,
  BoardColumn,
  ExecutionTasks,
  MoveTaskInput,
  PlanConflict,
  Priority,
  RequestReviewInput,
  RiskClass,
  Task,
  TaskControlInput,
  TaskList,
  TaskRef,
  TaskStatus,
} from "@ubuliera/contracts";

/** US4 board filters (GET /tasks query without `limit`, which keeps its server default). */
export interface TaskBoardFilters {
  executionId?: string;
  projectId?: string;
}
