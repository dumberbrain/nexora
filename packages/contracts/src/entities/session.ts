import { z } from "zod";

import { ExecutionModeSchema, RuntimeKindSchema, SessionStatusSchema } from "../enums";
import { EpochMsSchema, UlidSchema } from "../primitives";
import { RuntimeCapabilityProfileSchema } from "./capability";
import { TaskIdSchema } from "./task";

/** Token usage — present ONLY when the runtime reported it; never estimated by Ubuliera (FR-029). */
export const UsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  /** Claude Code's total_cost_usd is a client-side estimate */
  costUsd: z.number().nonnegative().nullable(),
  costIsEstimate: z.boolean(),
});
export type Usage = z.infer<typeof UsageSchema>;

export const SessionSchema = z.object({
  /** Claude Code session UUID */
  id: z.string().min(1).max(128),
  executionId: UlidSchema.nullable(),
  /** mode of the owning execution; null for observed sessions */
  executionMode: ExecutionModeSchema.nullable(),
  /** task this session is working on (Ubuliera-managed sessions only) */
  currentTaskId: TaskIdSchema.nullable(),
  projectId: UlidSchema.nullable(),
  runtime: RuntimeKindSchema,
  /** true for external_observed — UI labels "observe-only" */
  observeOnly: z.boolean(),
  cwd: z.string().min(1),
  gitBranch: z.string().nullable(),
  /** always set for Ubuliera-managed sessions (FR-034) */
  worktreePath: z.string().nullable(),
  model: z.string().nullable(),
  status: SessionStatusSchema,
  capabilities: RuntimeCapabilityProfileSchema,
  pid: z.number().int().positive().nullable(),
  usage: UsageSchema.nullable(),
  lastActivityAt: EpochMsSchema,
  startedAt: EpochMsSchema,
  endedAt: EpochMsSchema.nullable(),
});
export type Session = z.infer<typeof SessionSchema>;
