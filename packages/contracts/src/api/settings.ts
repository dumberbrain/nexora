import { z } from "zod";

import { ExecutionConfigSchema } from "../entities/execution";
import { TaskIdSchema } from "../entities/task";
import {
  ExecutionModeSchema,
  SessionStatusSchema,
  SeveritySchema,
  StrategySchema,
  TaskStatusSchema,
} from "../enums";
import { EpochMsSchema, UlidSchema } from "../primitives";

/*
 * US8 — settings, API tokens and the optional MCP server (contracts/mcp-tools.md).
 * Token secrets are shown exactly once on creation and stored only as a sha-256 hash.
 */

/* ---------- API tokens ---------- */

export const ApiTokenScopeSchema = z.enum(["read", "control"]);
export type ApiTokenScope = z.infer<typeof ApiTokenScopeSchema>;

export const ApiTokenSchema = z.object({
  id: UlidSchema,
  name: z.string().min(1).max(64),
  scope: ApiTokenScopeSchema,
  createdAt: EpochMsSchema,
  lastUsedAt: EpochMsSchema.nullable(),
  revokedAt: EpochMsSchema.nullable(),
});
export type ApiToken = z.infer<typeof ApiTokenSchema>;

/** GET /tokens — newest first, revoked included (greyed out in the UI) */
export const ApiTokenListSchema = z.object({ items: z.array(ApiTokenSchema) });
export type ApiTokenList = z.infer<typeof ApiTokenListSchema>;

/** POST /tokens — name is the MCP client name used in audit actors (`mcp_client:<name>`). */
export const CreateApiTokenInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/, "letters, digits, dot, underscore and dash only"),
  scope: ApiTokenScopeSchema,
});
export type CreateApiTokenInput = z.infer<typeof CreateApiTokenInputSchema>;

/** 201 — `secret` is returned only here, never again. */
export const CreateApiTokenResultSchema = z.object({
  token: ApiTokenSchema,
  secret: z.string().min(32),
});
export type CreateApiTokenResult = z.infer<typeof CreateApiTokenResultSchema>;

// DELETE /tokens/:id revokes (idempotent) and returns the ApiToken.

/* ---------- settings ---------- */

export const MCP_ENDPOINT_PATH = "/mcp";

/** GET /settings */
export const SettingsSchema = z.object({
  mcp: z.object({
    enabled: z.boolean(),
    /** absolute URL clients connect to (Streamable HTTP) */
    endpoint: z.string(),
  }),
  /** read-only: remote access is configured by env vars only (FR-050) */
  remote: z.object({
    enabled: z.boolean(),
    host: z.string(),
    port: z.number().int(),
    envTokenConfigured: z.boolean(),
  }),
});
export type Settings = z.infer<typeof SettingsSchema>;

/** PUT /settings/mcp — audited; disabled ⇒ /mcp answers 404. */
export const UpdateMcpSettingsInputSchema = z.object({ enabled: z.boolean() });
export type UpdateMcpSettingsInput = z.infer<typeof UpdateMcpSettingsInputSchema>;

/* ---------- MCP tools (contracts/mcp-tools.md) ---------- */

export const MCP_TOOLS = {
  analyze_task: "read",
  recommend_execution_mode: "read",
  create_execution_plan: "control",
  start_execution: "control",
  list_sessions: "read",
  list_agents: "read",
  get_agent_status: "read",
  list_tasks: "read",
  get_execution_status: "read",
  send_agent_message: "control",
  pause_execution: "control",
  resume_execution: "control",
  stop_execution: "control",
  get_execution_logs: "read",
} as const satisfies Record<string, ApiTokenScope>;
export type McpToolName = keyof typeof MCP_TOOLS;

const ExecutionRef = z.object({ executionId: UlidSchema });

export const MCP_TOOL_INPUTS = {
  analyze_task: z.object({ projectId: UlidSchema, prompt: z.string().trim().min(1).max(20_000) }),
  recommend_execution_mode: ExecutionRef,
  create_execution_plan: ExecutionRef.extend({
    mode: ExecutionModeSchema,
    strategy: StrategySchema,
    config: ExecutionConfigSchema.partial().optional(),
  }),
  start_execution: ExecutionRef,
  list_sessions: z.object({
    status: SessionStatusSchema.optional(),
    executionId: UlidSchema.optional(),
  }),
  list_agents: z.object({
    sessionId: z.string().min(1).optional(),
    executionId: UlidSchema.optional(),
  }),
  get_agent_status: z.object({ agentId: z.string().min(1).max(256) }),
  list_tasks: ExecutionRef.extend({ status: TaskStatusSchema.optional() }),
  get_execution_status: ExecutionRef,
  send_agent_message: z.object({
    agentId: z.string().min(1).max(256),
    text: z.string().trim().min(1).max(8000),
  }),
  pause_execution: ExecutionRef,
  resume_execution: ExecutionRef,
  stop_execution: ExecutionRef,
  get_execution_logs: ExecutionRef.extend({
    cursor: UlidSchema.optional(),
    limit: z.number().int().min(1).max(200).default(50),
    severity: SeveritySchema.optional(),
  }),
} as const satisfies Record<McpToolName, z.ZodType>;

/** structuredContent of `start_execution` — risky tasks are never approved over MCP. */
export const McpStartExecutionResultSchema = z.object({
  status: z.enum(["started", "approval_required"]),
  executionId: UlidSchema,
  /** risky tasks waiting for a human decision in the dashboard */
  pendingApprovalTaskIds: z.array(TaskIdSchema),
  dashboardUrl: z.string(),
});
export type McpStartExecutionResult = z.infer<typeof McpStartExecutionResultSchema>;
