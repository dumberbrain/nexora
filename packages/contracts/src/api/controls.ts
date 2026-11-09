import { z } from "zod";

import { MessageSchema, MESSAGE_TYPES } from "../entities/message";
import { TaskIdSchema, TaskTitleSchema } from "../entities/task";
import { RiskClassSchema } from "../enums";
import { UlidSchema } from "../primitives";

/*
 * US3 — human controls (contracts/rest-api.md "Executions", "Tasks", "Sessions & agents").
 * Every control returns the updated entity (Execution, Task, Session) so the UI can patch its
 * cache; unsupported controls fail with 422 CAPABILITY_UNSUPPORTED, observed sessions with 409.
 */

/** The user-facing name of the `pause` control (FR-031): interrupt the turn, keep the session. */
export const PAUSE_CONTROL_LABEL = "Interrupt & hold";

/** Controls a UI can offer, derived only from capabilities + status. */
export const CONTROL_KINDS = [
  "stop",
  "interrupt",
  "pause",
  "resume",
  "restart",
  "send_message",
  "cancel_task",
  "retry_task",
  "request_review",
  "assign_task",
] as const;
export const ControlKindSchema = z.enum(CONTROL_KINDS);
export type ControlKind = z.infer<typeof ControlKindSchema>;

/** POST /executions/:id/tasks — assign an additional task to a running execution. */
export const AssignTaskInputSchema = z.object({
  title: TaskTitleSchema,
  description: z.string().max(20_000).default(""),
  assignedAgentRole: z.string().trim().min(1).max(100).nullable().default(null),
  dependsOn: z.array(TaskIdSchema).default([]),
  priority: z.enum(["p1", "p2", "p3"]).default("p2"),
  /** globs this task may edit; empty ⇒ `**` (conflicts with every parallel task) */
  ownedPaths: z.array(z.string().min(1)).default([]),
  riskClass: RiskClassSchema.default("normal"),
});
export type AssignTaskInput = z.infer<typeof AssignTaskInputSchema>;

/** POST /tasks/:id/review — request a review by the Code Reviewer role. */
export const RequestReviewInputSchema = z.object({
  note: z.string().trim().max(2000).optional(),
});
export type RequestReviewInput = z.infer<typeof RequestReviewInputSchema>;

/** POST /tasks/:id/cancel and /retry carry an optional reason (audit only). */
export const TaskControlInputSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});
export type TaskControlInput = z.infer<typeof TaskControlInputSchema>;

/**
 * Task routes address a task by execution + task id, because `T-<n>` is unique only per
 * execution: `/executions/:executionId/tasks/:taskId/{cancel,retry,review}`.
 * (rest-api.md's `/tasks/:id/…` is shorthand for this.)
 */
export const TaskRefSchema = z.object({ executionId: UlidSchema, taskId: TaskIdSchema });
export type TaskRef = z.infer<typeof TaskRefSchema>;

/** GET /messages?executionId=&taskId=&limit=&cursor= — Communication Center feed. */
export const MessageListQuerySchema = z.object({
  executionId: UlidSchema.optional(),
  taskId: TaskIdSchema.optional(),
  type: z.enum(MESSAGE_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  /** message id; returns older messages */
  cursor: UlidSchema.optional(),
});
export type MessageListQuery = z.infer<typeof MessageListQuerySchema>;

export const MessageListSchema = z.object({
  items: z.array(MessageSchema),
  nextCursor: UlidSchema.nullable(),
});
export type MessageList = z.infer<typeof MessageListSchema>;

/** PUT /projects/:id/model-consent — per-project "always allow" model usage (FR-008). */
export const ModelConsentInputSchema = z.object({ alwaysAllow: z.boolean() });
export type ModelConsentInput = z.infer<typeof ModelConsentInputSchema>;

/** GET/PUT /projects/:id/model-consent */
export const ModelConsentSchema = z.object({ projectId: UlidSchema, alwaysAllow: z.boolean() });
export type ModelConsent = z.infer<typeof ModelConsentSchema>;

/** POST /executions/:id/analysis — model-backed refinement, consent required (FR-008). */
export const RefineAnalysisInputSchema = z.object({
  consent: z.boolean().default(false),
  rememberConsentForProject: z.boolean().default(false),
});
export type RefineAnalysisInput = z.infer<typeof RefineAnalysisInputSchema>;
