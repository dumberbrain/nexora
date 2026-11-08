import { z } from "zod";

import { ExecutionModeSchema, ExecutionStatusSchema, StrategySchema } from "../enums";
import { AbsolutePathSchema, EpochMsSchema, UlidSchema } from "../primitives";
import { DetectedStackSchema } from "./project";

/** Execution.prompt: "1–20 000 chars". */
export const PromptSchema = z.string().trim().min(1).max(20_000);

export const COMPLEXITIES = ["low", "medium", "high", "very_high"] as const;

export const TaskAnalysisSchema = z.object({
  stack: DetectedStackSchema,
  instructionFiles: z.array(z.string()),
  skills: z.array(z.string()),
  agents: z.array(z.string()),
  mcpServers: z.array(z.string()),
  complexity: z.enum(COMPLEXITIES),
  summary: z.string().max(4000),
  /** true only when a model-backed analysis ran with consent (FR-008). */
  modelAssisted: z.boolean(),
});
export type TaskAnalysis = z.infer<typeof TaskAnalysisSchema>;

export const DEFAULT_MAX_PARALLEL_SESSIONS = 4;
export const MAX_PARALLEL_SESSIONS = 8;
export const DEFAULT_IDLE_TIMEOUT_MS = 600_000;
export const DEFAULT_TURN_TIMEOUT_MS = 1_800_000;

/**
 * Answers to follow-up questions. Constraints verbatim from data-model.md:
 * maxParallelSessions "≤ 8 (default 4)", idleTimeoutMs "default 600 000",
 * turnTimeoutMs "default 1 800 000", modelAnalysisConsent boolean.
 */
export const ExecutionConfigSchema = z.object({
  parallelism: z.enum(["sequential", "parallel", "hybrid"]).default("parallel"),
  approvalCheckpoints: z.boolean().default(true),
  maxParallelSessions: z
    .number()
    .int()
    .min(1)
    .max(MAX_PARALLEL_SESSIONS)
    .default(DEFAULT_MAX_PARALLEL_SESSIONS),
  budgetUsd: z.number().positive().optional(),
  idleTimeoutMs: z.number().int().min(10_000).default(DEFAULT_IDLE_TIMEOUT_MS),
  turnTimeoutMs: z.number().int().min(60_000).default(DEFAULT_TURN_TIMEOUT_MS),
  modelAnalysisConsent: z.boolean().default(false),
  /** run the project's test command during verification (explicit opt-in) */
  runTestsOnVerify: z.boolean().default(false),
  answers: z.record(z.string(), z.unknown()).default({}),
});
export type ExecutionConfig = z.infer<typeof ExecutionConfigSchema>;

export const VerificationSchema = z.object({
  completedTaskIds: z.array(z.string()),
  failedTaskIds: z.array(z.string()),
  changedFiles: z.array(z.string()),
  testResults: z
    .object({ passed: z.number().int(), failed: z.number().int(), skipped: z.number().int() })
    .nullable(),
});
export type Verification = z.infer<typeof VerificationSchema>;

export const ExecutionSchema = z.object({
  id: UlidSchema,
  projectId: UlidSchema,
  prompt: PromptSchema,
  analysis: TaskAnalysisSchema.nullable(),
  mode: ExecutionModeSchema.nullable(),
  strategy: StrategySchema.nullable(),
  config: ExecutionConfigSchema,
  status: ExecutionStatusSchema,
  /** "default false" — true only with explicit per-execution confirmation (FR-053). */
  permissionBypass: z.boolean().default(false),
  /** execution-level isolated worktree (FR-034) */
  worktreePath: AbsolutePathSchema.nullable(),
  verification: VerificationSchema.nullable(),
  createdAt: EpochMsSchema,
  startedAt: EpochMsSchema.nullable(),
  endedAt: EpochMsSchema.nullable(),
});
export type Execution = z.infer<typeof ExecutionSchema>;

export const CreateExecutionInputSchema = z.object({
  projectId: UlidSchema,
  prompt: PromptSchema,
});
export type CreateExecutionInput = z.infer<typeof CreateExecutionInputSchema>;
