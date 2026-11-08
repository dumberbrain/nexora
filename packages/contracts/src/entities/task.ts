import { z } from "zod";

import {
  ExecutionModeSchema,
  PrioritySchema,
  RiskClassSchema,
  type TaskStatus,
  TaskStatusSchema,
} from "../enums";
import { EpochMsSchema, UlidSchema } from "../primitives";

/** Task id: `T-<n>`, unique per execution. */
export const TaskIdSchema = z.string().regex(/^T-[1-9]\d*$/, "must look like T-<n>");

/** Task.title: "1–200". */
export const TaskTitleSchema = z.string().trim().min(1).max(200);

export const TestResultsSchema = z.object({
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  reportPath: z.string().optional(),
});

export const TaskSchema = z.object({
  id: TaskIdSchema,
  executionId: UlidSchema,
  title: TaskTitleSchema,
  description: z.string().max(20_000),
  assignedAgentRole: z.string().nullable(),
  agentId: z.string().nullable(),
  mode: ExecutionModeSchema,
  /** required when the execution mode is hybrid (checked at plan level) */
  mechanismReason: z.string().nullable(),
  priority: PrioritySchema,
  status: TaskStatusSchema,
  dependsOn: z.array(TaskIdSchema),
  /** globs this task may edit; overlap with a parallel task ⇒ conflict */
  ownedPaths: z.array(z.string().min(1)),
  riskClass: RiskClassSchema,
  changedFiles: z.array(z.string()),
  testResults: TestResultsSchema.nullable(),
  attempt: z.number().int().min(1),
  previousAttemptId: TaskIdSchema.nullable(),
  startedAt: EpochMsSchema.nullable(),
  completedAt: EpochMsSchema.nullable(),
});
export type Task = z.infer<typeof TaskSchema>;

export const BOARD_COLUMNS = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "completed",
  "failed",
] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

/** Board column is derived from status (data-model.md → Task). */
export function boardColumnOf(status: TaskStatus): BoardColumn {
  switch (status) {
    case "pending":
      return "backlog";
    case "queued":
      return "todo";
    case "planning":
    case "running":
    case "waiting_for_input":
    case "blocked":
      return "in_progress";
    case "reviewing":
      return "review";
    case "completed":
      return "completed";
    case "failed":
    case "cancelled":
      return "failed";
  }
}
