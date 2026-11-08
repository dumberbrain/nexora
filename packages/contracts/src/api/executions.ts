import { z } from "zod";

import { ApprovalRequestSchema } from "../entities/approval";
import { RuntimeCapabilityProfileSchema } from "../entities/capability";
import { ExecutionConfigSchema, ExecutionSchema } from "../entities/execution";
import { TaskIdSchema, TaskSchema } from "../entities/task";
import { ExecutionModeSchema, RiskClassSchema, RuntimeKindSchema, StrategySchema } from "../enums";

// ---------- runtime environment (GET /runtime/environment) ----------

export const RuntimeAvailabilitySchema = z.object({
  kind: RuntimeKindSchema,
  available: z.boolean(),
  reason: z.string().nullable(),
  capabilities: RuntimeCapabilityProfileSchema,
});
export type RuntimeAvailability = z.infer<typeof RuntimeAvailabilitySchema>;

export const RuntimeEnvironmentSchema = z.object({
  claude: z.object({
    installed: z.boolean(),
    version: z.string().nullable(),
    /** null when it could not be determined without spending model usage */
    authenticated: z.boolean().nullable(),
    reason: z.string().nullable(),
  }),
  agentTeams: z.object({
    enabled: z.boolean(),
    /** where the flag was found, or how to enable it */
    detail: z.string(),
  }),
  runtimes: z.array(RuntimeAvailabilitySchema),
});
export type RuntimeEnvironment = z.infer<typeof RuntimeEnvironmentSchema>;

// ---------- executions ----------

export const ExecutionListSchema = z.object({ items: z.array(ExecutionSchema) });
export type ExecutionList = z.infer<typeof ExecutionListSchema>;

/** GET /executions/:id/modes — only modes usable here are selectable (US2-AS2). */
export const ModeOptionSchema = z.object({
  mode: ExecutionModeSchema,
  available: z.boolean(),
  recommended: z.boolean(),
  /** why this mode fits (or not) this task */
  reason: z.string(),
  unavailableReason: z.string().nullable(),
  howToEnable: z.string().nullable(),
  runtimes: z.array(RuntimeKindSchema),
});
export type ModeOption = z.infer<typeof ModeOptionSchema>;
export const ModeOptionListSchema = z.object({ items: z.array(ModeOptionSchema) });

export const SetModeInputSchema = z.object({
  mode: ExecutionModeSchema,
  strategy: StrategySchema,
});
export type SetModeInput = z.infer<typeof SetModeInputSchema>;

/** One follow-up question; `key` is an ExecutionConfig field or `answers.<name>` (FR-005). */
export const QuestionSchema = z.object({
  key: z.string().min(1).max(80),
  kind: z.enum(["single", "multi", "boolean", "number", "text"]),
  label: z.string().min(1).max(200),
  help: z.string().max(1000).nullable(),
  options: z
    .array(z.object({ value: z.string(), label: z.string(), description: z.string().nullable() }))
    .nullable(),
  recommendedDefault: z.unknown(),
  min: z.number().nullable(),
  max: z.number().nullable(),
});
export type Question = z.infer<typeof QuestionSchema>;
export const QuestionListSchema = z.object({ items: z.array(QuestionSchema) });

export const UpdateConfigInputSchema = z.object({ config: ExecutionConfigSchema });
export type UpdateConfigInput = z.infer<typeof UpdateConfigInputSchema>;

/**
 * POST /executions/:id/plan. Model-backed planning needs consent (FR-008): `consent: true` for
 * this execution, optionally remembered per project. Without it the server returns 428
 * APPROVAL_REQUIRED; `modelAssisted: false` produces a local, heuristic plan instead.
 */
export const GeneratePlanInputSchema = z.object({
  modelAssisted: z.boolean().default(false),
  consent: z.boolean().default(false),
  rememberConsentForProject: z.boolean().default(false),
});
export type GeneratePlanInput = z.infer<typeof GeneratePlanInputSchema>;

export const PlanConflictSchema = z.object({
  taskIds: z.tuple([TaskIdSchema, TaskIdSchema]),
  /** overlapping ownedPaths globs */
  paths: z.array(z.string()),
  resolution: z.enum(["serialised", "separate_worktrees"]),
});
export type PlanConflict = z.infer<typeof PlanConflictSchema>;

/** GET /executions/:id/tasks */
export const ExecutionTasksSchema = z.object({
  items: z.array(TaskSchema),
  conflicts: z.array(PlanConflictSchema),
});
export type ExecutionTasks = z.infer<typeof ExecutionTasksSchema>;

/** Exact phrase a user must type to enable permission bypass for one execution (FR-053). */
export const BYPASS_CONFIRMATION_PHRASE = "bypass permissions";

export const ApproveExecutionInputSchema = z
  .object({
    /** risky tasks (riskClass ≠ normal) approved now; the rest wait in the approvals inbox */
    approveRiskyTaskIds: z.array(TaskIdSchema).default([]),
    permissionBypass: z.boolean().default(false),
    bypassConfirmation: z.string().optional(),
  })
  .refine((v) => !v.permissionBypass || v.bypassConfirmation === BYPASS_CONFIRMATION_PHRASE, {
    message: `Type "${BYPASS_CONFIRMATION_PHRASE}" to enable permission bypass`,
    path: ["bypassConfirmation"],
  });
export type ApproveExecutionInput = z.infer<typeof ApproveExecutionInputSchema>;

/** Planner output for one task before ids/status are assigned (validated server-side). */
export const PlannedTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20_000),
  assignedAgentRole: z.string().nullable(),
  dependsOn: z.array(TaskIdSchema),
  priority: z.enum(["p1", "p2", "p3"]),
  ownedPaths: z.array(z.string().min(1)).min(1),
  riskClass: RiskClassSchema,
  mechanismReason: z.string().nullable(),
});
export type PlannedTask = z.infer<typeof PlannedTaskSchema>;

/** GET /approvals?status=pending */
export const ApprovalListSchema = z.object({ items: z.array(ApprovalRequestSchema) });
export type ApprovalList = z.infer<typeof ApprovalListSchema>;
