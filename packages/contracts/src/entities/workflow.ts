import { z } from "zod";

import { EpochMsSchema, UlidSchema } from "../primitives";

export const WORKFLOW_NODE_KINDS = [
  "start",
  "end",
  "agent",
  "skill",
  "mcp_tool",
  "condition",
  "approval",
  "parallel_fork",
  "parallel_join",
] as const;
export const WorkflowNodeKindSchema = z.enum(WORKFLOW_NODE_KINDS);
export type WorkflowNodeKind = z.infer<typeof WorkflowNodeKindSchema>;

export const MAX_RETRY_ATTEMPTS = 5;

/** Workflow node retry: "maxAttempts ≤ 5, backoffMs". */
export const RetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(MAX_RETRY_ATTEMPTS).default(1),
  backoffMs: z.number().int().min(0).max(600_000).default(0),
});

/** onError: `fail | continue | goto(nodeId)` — goto encoded as `{ goto: nodeId }`. */
export const OnErrorSchema = z.union([
  z.literal("fail"),
  z.literal("continue"),
  z.object({ goto: z.string().min(1) }),
]);
export type OnError = z.infer<typeof OnErrorSchema>;

export const WorkflowNodeSchema = z.object({
  id: z.string().min(1).max(64),
  kind: WorkflowNodeKindSchema,
  label: z.string().min(1).max(120),
  config: z.record(z.string(), z.unknown()).default({}),
  retry: RetryPolicySchema.default({ maxAttempts: 1, backoffMs: 0 }),
  onError: OnErrorSchema.default("fail"),
  position: z.object({ x: z.number(), y: z.number() }),
});
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

export const WorkflowEdgeSchema = z.object({
  id: z.string().min(1).max(64),
  source: z.string().min(1),
  target: z.string().min(1),
  /** for condition nodes: which branch this edge represents */
  branch: z.enum(["true", "false"]).optional(),
});
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

export const WorkflowGraphSchema = z.object({
  nodes: z.array(WorkflowNodeSchema).min(2).max(200),
  edges: z.array(WorkflowEdgeSchema).max(500),
});
export type WorkflowGraph = z.infer<typeof WorkflowGraphSchema>;

export const WorkflowDefinitionSchema = z.object({
  id: UlidSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000),
  createdAt: EpochMsSchema,
});
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

/** Immutable once saved; `version` increments per definition. */
export const WorkflowVersionSchema = z.object({
  id: UlidSchema,
  definitionId: UlidSchema,
  version: z.number().int().min(1),
  graph: WorkflowGraphSchema,
  createdAt: EpochMsSchema,
});
export type WorkflowVersion = z.infer<typeof WorkflowVersionSchema>;

export const WORKFLOW_RUN_STATUSES = [
  "pending",
  "running",
  "waiting_for_approval",
  "completed",
  "failed",
  "cancelled",
] as const;

export const WorkflowRunSchema = z.object({
  id: UlidSchema,
  versionId: UlidSchema,
  executionId: UlidSchema,
  status: z.enum(WORKFLOW_RUN_STATUSES),
  startedAt: EpochMsSchema.nullable(),
  endedAt: EpochMsSchema.nullable(),
});
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;

export const WorkflowNodeRunSchema = z.object({
  id: UlidSchema,
  runId: UlidSchema,
  nodeId: z.string().min(1),
  attempt: z.number().int().min(1).max(MAX_RETRY_ATTEMPTS),
  status: z.enum([...WORKFLOW_RUN_STATUSES, "skipped"]),
  sessionId: z.string().nullable(),
  outputSummary: z.string().max(2000).nullable(),
  error: z.string().max(2000).nullable(),
});
export type WorkflowNodeRun = z.infer<typeof WorkflowNodeRunSchema>;
