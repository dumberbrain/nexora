import { z } from "zod";

import {
  WorkflowDefinitionSchema,
  WorkflowGraphSchema,
  type WorkflowNodeKind,
  WorkflowNodeRunSchema,
  WorkflowRunSchema,
  WorkflowVersionSchema,
} from "../entities/workflow";
import { RiskClassSchema } from "../enums";
import { UlidSchema } from "../primitives";

/*
 * US5 — workflows (contracts/rest-api.md "Workflows"). Versions are immutable; saving a graph
 * creates version n+1. Running a version creates an execution in mode `workflow`.
 */

/* ---------- per-kind node config (WorkflowNode.config is validated against these) ---------- */

export const AgentNodeConfigSchema = z.object({
  /** built-in role (roles.ts) or a discovered project agent name */
  role: z.string().trim().min(1).max(100),
  prompt: z.string().trim().min(1).max(20_000),
  /** globs this node may edit; empty ⇒ whole execution worktree */
  ownedPaths: z.array(z.string().min(1)).default([]),
});
export const SkillNodeConfigSchema = z.object({
  /** discovered skill name; must be `executable` (user-invocable) */
  skill: z.string().trim().min(1).max(200),
  args: z.string().max(4000).default(""),
});
export const McpToolNodeConfigSchema = z.object({
  /** discovered MCP server name */
  server: z.string().trim().min(1).max(200),
  tool: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(20_000),
});
export const ConditionNodeConfigSchema = z.object({
  /**
   * Sandboxed expression over previous node outputs, e.g. `nodes.tests.status == "completed"`.
   * Variables: `nodes.<nodeId>.status` and `nodes.<nodeId>.output` (summary text).
   */
  expression: z.string().trim().min(1).max(1000),
});
export const ApprovalNodeConfigSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  riskClass: RiskClassSchema.default("normal"),
});
const EmptyConfigSchema = z.object({}).strict();

export const NODE_CONFIG_SCHEMAS = {
  start: EmptyConfigSchema,
  end: EmptyConfigSchema,
  parallel_fork: EmptyConfigSchema,
  parallel_join: EmptyConfigSchema,
  agent: AgentNodeConfigSchema,
  skill: SkillNodeConfigSchema,
  mcp_tool: McpToolNodeConfigSchema,
  condition: ConditionNodeConfigSchema,
  approval: ApprovalNodeConfigSchema,
} as const satisfies Record<WorkflowNodeKind, z.ZodType>;

/* ---------- graph validation result ---------- */

export const GraphIssueSchema = z.object({
  /** node or edge id the issue is about; null = whole graph */
  ref: z.string().nullable(),
  code: z.enum([
    "start_count",
    "end_unreachable",
    "cycle",
    "dangling_edge",
    "unreachable_node",
    "invalid_config",
    "condition_branches",
    "fork_join_mismatch",
    "on_error_target",
    "skill_not_executable",
    "unknown_reference",
  ]),
  message: z.string().max(500),
});
export type GraphIssue = z.infer<typeof GraphIssueSchema>;

/** POST /workflows/validate (also the `details` of a 400 VALIDATION_FAILED on save). */
export const GraphValidationSchema = z.object({
  valid: z.boolean(),
  issues: z.array(GraphIssueSchema),
});
export type GraphValidation = z.infer<typeof GraphValidationSchema>;

/* ---------- definitions & versions ---------- */

/** POST /workflows — creates the definition and, if `graph` is given, version 1. */
export const CreateWorkflowInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).default(""),
  graph: WorkflowGraphSchema.optional(),
});
export type CreateWorkflowInput = z.infer<typeof CreateWorkflowInputSchema>;

/** One row of GET /workflows. */
export const WorkflowSummarySchema = WorkflowDefinitionSchema.extend({
  latestVersion: z.number().int().min(1).nullable(),
  /** seeded built-in template (spec-driven, tdd-feature, review-and-merge) */
  builtIn: z.boolean(),
});
export type WorkflowSummary = z.infer<typeof WorkflowSummarySchema>;

export const WorkflowListSchema = z.object({ items: z.array(WorkflowSummarySchema) });
export type WorkflowList = z.infer<typeof WorkflowListSchema>;

/** GET /workflows/:id */
export const WorkflowDetailSchema = WorkflowSummarySchema.extend({
  latest: WorkflowVersionSchema.nullable(),
});
export type WorkflowDetail = z.infer<typeof WorkflowDetailSchema>;

/** GET /workflows/:id/versions — newest first, without graphs. */
export const WorkflowVersionListSchema = z.object({
  items: z.array(WorkflowVersionSchema.omit({ graph: true })),
});
export type WorkflowVersionList = z.infer<typeof WorkflowVersionListSchema>;

/** POST /workflows/:id/versions → 201 WorkflowVersion (graph validated, else 400). */
export const SaveWorkflowVersionInputSchema = z.object({ graph: WorkflowGraphSchema });
export type SaveWorkflowVersionInput = z.infer<typeof SaveWorkflowVersionInputSchema>;

/* ---------- runs ---------- */

/** POST /workflows/:id/versions/:v/run → 201 { executionId, run } */
export const RunWorkflowInputSchema = z.object({
  projectId: UlidSchema,
  /** context passed to every agent/skill/MCP node */
  prompt: z.string().trim().max(20_000).default(""),
});
export type RunWorkflowInput = z.infer<typeof RunWorkflowInputSchema>;

export const RunWorkflowResultSchema = z.object({
  executionId: UlidSchema,
  run: WorkflowRunSchema,
});
export type RunWorkflowResult = z.infer<typeof RunWorkflowResultSchema>;

/** GET /executions/:id/workflow-run — live run state per node (editor overlay). */
export const WorkflowRunDetailSchema = z.object({
  run: WorkflowRunSchema,
  version: WorkflowVersionSchema,
  /** latest attempt per node */
  nodes: z.array(WorkflowNodeRunSchema),
});
export type WorkflowRunDetail = z.infer<typeof WorkflowRunDetailSchema>;

/** Payload of the `workflow.node_changed` event. */
export const WorkflowNodeChangedPayloadSchema = z.object({
  runId: UlidSchema,
  nodeId: z.string().min(1),
  attempt: z.number().int().min(1),
  status: WorkflowNodeRunSchema.shape.status,
});
export type WorkflowNodeChangedPayload = z.infer<typeof WorkflowNodeChangedPayloadSchema>;
