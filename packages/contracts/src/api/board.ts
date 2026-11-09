import { z } from "zod";

import { TaskSchema } from "../entities/task";
import { UlidSchema } from "../primitives";

/*
 * US4 — task board (contracts/rest-api.md "Tasks"). Columns are derived from status with
 * `boardColumnOf`; the only user move is Backlog ⇄ Todo (`pending ⇄ queued`). Every other move
 * is refused with 409 CONFLICT and a human-readable reason.
 */

/** Statuses a user may set by dragging a card. */
export const USER_MOVABLE_STATUSES = ["pending", "queued"] as const;

/** PATCH /executions/:executionId/tasks/:taskId/status */
export const MoveTaskInputSchema = z.object({
  status: z.enum(USER_MOVABLE_STATUSES),
});
export type MoveTaskInput = z.infer<typeof MoveTaskInputSchema>;

/** GET /tasks?executionId=&projectId= — board across executions, newest execution first. */
export const TaskListQuerySchema = z.object({
  executionId: UlidSchema.optional(),
  projectId: UlidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});
export type TaskListQuery = z.infer<typeof TaskListQuerySchema>;

export const TaskListSchema = z.object({ items: z.array(TaskSchema) });
export type TaskList = z.infer<typeof TaskListSchema>;
