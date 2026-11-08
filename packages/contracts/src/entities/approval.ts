import { z } from "zod";

import { ApprovalStatusSchema, RiskClassSchema } from "../enums";
import { EpochMsSchema, UlidSchema } from "../primitives";

/** An action awaiting a human decision. No timeout ever auto-approves (FR-033). */
export const ApprovalRequestSchema = z.object({
  id: UlidSchema,
  executionId: UlidSchema.nullable(),
  taskId: z.string().nullable(),
  sessionId: z.string().nullable(),
  agentId: z.string().nullable(),
  /** tool name or orchestrator operation */
  action: z.string().min(1).max(200),
  riskClass: RiskClassSchema,
  /** redacted */
  details: z.unknown(),
  status: ApprovalStatusSchema,
  decidedBy: z.string().nullable(),
  decidedAt: EpochMsSchema.nullable(),
  note: z.string().max(1000).nullable(),
  createdAt: EpochMsSchema,
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export const ApprovalDecisionInputSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(1000).optional(),
});
export type ApprovalDecisionInput = z.infer<typeof ApprovalDecisionInputSchema>;
