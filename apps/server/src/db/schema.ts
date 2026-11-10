/**
 * SQLite schema (data-model.md). Timestamps are epoch ms integers; JSON columns hold values that
 * were redacted before insert. FTS5 table `events_fts` + sync triggers live in a custom migration.
 */
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import type {
  AgentKind,
  AgentStatus,
  ApprovalStatus,
  DetectedStack,
  EventSource,
  EventType,
  ExecutionConfig,
  ExecutionMode,
  ExecutionStatus,
  Participant,
  Priority,
  Reliability,
  RiskClass,
  RuntimeCapabilityProfile,
  RuntimeKind,
  SessionStatus,
  Severity,
  Strategy,
  TaskAnalysis,
  TaskStatus,
  Usage,
  Verification,
  WorkflowGraph,
} from "@ubuliera/contracts";

const ts = (name: string) => integer(name);
const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();
const bool = (name: string) => integer(name, { mode: "boolean" });

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    rootPath: text("root_path").notNull(),
    detectedStack: json<DetectedStack>("detected_stack").notNull(),
    instructionFiles: json<string[]>("instruction_files").notNull(),
    hooksInstalled: bool("hooks_installed").notNull().default(false),
    /** sha-256 of the per-project hook ingest token; the token itself is never stored */
    hookTokenHash: text("hook_token_hash"),
    createdAt: ts("created_at").notNull(),
    lastAnalyzedAt: ts("last_analyzed_at"),
  },
  (t) => [uniqueIndex("projects_root_path_uq").on(t.rootPath)],
);

export const executions = sqliteTable(
  "executions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    prompt: text("prompt").notNull(),
    analysis: json<TaskAnalysis>("analysis"),
    mode: text("mode").$type<ExecutionMode>(),
    strategy: text("strategy").$type<Strategy>(),
    config: json<ExecutionConfig>("config").notNull(),
    status: text("status").$type<ExecutionStatus>().notNull(),
    permissionBypass: bool("permission_bypass").notNull().default(false),
    worktreePath: text("worktree_path"),
    verification: json<Verification>("verification"),
    createdAt: ts("created_at").notNull(),
    startedAt: ts("started_at"),
    endedAt: ts("ended_at"),
  },
  (t) => [
    index("executions_project_idx").on(t.projectId),
    index("executions_status_idx").on(t.status),
  ],
);

export const tasks = sqliteTable(
  "tasks",
  {
    executionId: text("execution_id")
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    assignedAgentRole: text("assigned_agent_role"),
    agentId: text("agent_id"),
    mode: text("mode").$type<ExecutionMode>().notNull(),
    mechanismReason: text("mechanism_reason"),
    priority: text("priority").$type<Priority>().notNull(),
    status: text("status").$type<TaskStatus>().notNull(),
    ownedPaths: json<string[]>("owned_paths").notNull(),
    riskClass: text("risk_class").$type<RiskClass>().notNull().default("normal"),
    changedFiles: json<string[]>("changed_files").notNull(),
    testResults: json<{ passed: number; failed: number; skipped: number; reportPath?: string }>(
      "test_results",
    ),
    attempt: integer("attempt").notNull().default(1),
    previousAttemptId: text("previous_attempt_id"),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
  },
  (t) => [primaryKey({ columns: [t.executionId, t.id] }), index("tasks_status_idx").on(t.status)],
);

export const taskDependencies = sqliteTable(
  "task_dependencies",
  {
    executionId: text("execution_id")
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    taskId: text("task_id").notNull(),
    dependsOnTaskId: text("depends_on_task_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.executionId, t.taskId, t.dependsOnTaskId] })],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    executionId: text("execution_id").references(() => executions.id),
    executionMode: text("execution_mode").$type<ExecutionMode>(),
    currentTaskId: text("current_task_id"),
    projectId: text("project_id").references(() => projects.id),
    runtime: text("runtime").$type<RuntimeKind>().notNull(),
    observeOnly: bool("observe_only").notNull(),
    cwd: text("cwd").notNull(),
    gitBranch: text("git_branch"),
    worktreePath: text("worktree_path"),
    model: text("model"),
    status: text("status").$type<SessionStatus>().notNull(),
    capabilities: json<RuntimeCapabilityProfile>("capabilities").notNull(),
    pid: integer("pid"),
    usage: json<Usage>("usage"),
    lastActivityAt: ts("last_activity_at").notNull(),
    startedAt: ts("started_at").notNull(),
    endedAt: ts("ended_at"),
  },
  (t) => [
    index("sessions_status_idx").on(t.status),
    index("sessions_execution_idx").on(t.executionId),
  ],
);

export const agents = sqliteTable(
  "agents",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    parentAgentId: text("parent_agent_id"),
    kind: text("kind").$type<AgentKind>().notNull(),
    name: text("name").notNull(),
    role: text("role"),
    definitionPath: text("definition_path"),
    status: text("status").$type<AgentStatus>().notNull(),
    currentTaskId: text("current_task_id"),
    summary: text("summary"),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [index("agents_session_idx").on(t.sessionId), index("agents_status_idx").on(t.status)],
);

/** No FKs on purpose: hook events may reference sessions before they are projected. */
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    ts: ts("ts").notNull(),
    type: text("type").$type<EventType>().notNull(),
    source: text("source").$type<EventSource>().notNull(),
    reliability: text("reliability").$type<Reliability>().notNull(),
    severity: text("severity").$type<Severity>().notNull(),
    executionId: text("execution_id"),
    sessionId: text("session_id"),
    agentId: text("agent_id"),
    taskId: text("task_id"),
    summary: text("summary").notNull(),
    payload: json<unknown>("payload"),
    truncated: bool("truncated").notNull().default(false),
  },
  (t) => [
    index("events_session_id_idx").on(t.sessionId, t.id),
    index("events_execution_id_idx").on(t.executionId, t.id),
    index("events_agent_id_idx").on(t.agentId, t.id),
    index("events_type_ts_idx").on(t.type, t.ts),
    index("events_ts_idx").on(t.ts),
  ],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    executionId: text("execution_id"),
    taskId: text("task_id"),
    from: json<Participant>("from_participant").notNull(),
    to: json<Participant>("to_participant").notNull(),
    type: text("type").notNull(),
    summary: text("summary").notNull(),
    ts: ts("ts").notNull(),
  },
  (t) => [index("messages_execution_idx").on(t.executionId, t.id)],
);

export const approvalRequests = sqliteTable(
  "approval_requests",
  {
    id: text("id").primaryKey(),
    executionId: text("execution_id"),
    taskId: text("task_id"),
    sessionId: text("session_id"),
    agentId: text("agent_id"),
    action: text("action").notNull(),
    riskClass: text("risk_class").$type<RiskClass>().notNull(),
    details: json<unknown>("details"),
    status: text("status").$type<ApprovalStatus>().notNull(),
    decidedBy: text("decided_by"),
    decidedAt: ts("decided_at"),
    note: text("note"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("approvals_status_idx").on(t.status)],
);

export const workflowDefinitions = sqliteTable("workflow_definitions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  /** seeded built-in template (spec-driven, tdd-feature, review-and-merge) */
  builtIn: bool("built_in").notNull().default(false),
  createdAt: ts("created_at").notNull(),
});

export const workflowVersions = sqliteTable(
  "workflow_versions",
  {
    id: text("id").primaryKey(),
    definitionId: text("definition_id")
      .notNull()
      .references(() => workflowDefinitions.id),
    version: integer("version").notNull(),
    graph: json<WorkflowGraph>("graph").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [uniqueIndex("workflow_versions_def_ver_uq").on(t.definitionId, t.version)],
);

export const workflowRuns = sqliteTable("workflow_runs", {
  id: text("id").primaryKey(),
  versionId: text("version_id")
    .notNull()
    .references(() => workflowVersions.id),
  executionId: text("execution_id")
    .notNull()
    .references(() => executions.id),
  status: text("status").notNull(),
  startedAt: ts("started_at"),
  endedAt: ts("ended_at"),
});

export const workflowNodeRuns = sqliteTable(
  "workflow_node_runs",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    attempt: integer("attempt").notNull(),
    status: text("status").notNull(),
    sessionId: text("session_id"),
    outputSummary: text("output_summary"),
    error: text("error"),
  },
  (t) => [index("workflow_node_runs_run_idx").on(t.runId)],
);

export const integrations = sqliteTable(
  "integrations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    scope: text("scope").notNull(),
    sourcePath: text("source_path"),
    executable: bool("executable").notNull().default(false),
    health: text("health").notNull().default("unknown"),
    permissionStatus: text("permission_status").notNull(),
    metadata: json<Record<string, unknown>>("metadata").notNull(),
    discoveredAt: ts("discovered_at").notNull(),
  },
  (t) => [index("integrations_project_idx").on(t.projectId, t.kind)],
);

/** Append-only — the service exposes no update/delete (FR-054). */
export const auditEntries = sqliteTable(
  "audit_entries",
  {
    id: text("id").primaryKey(),
    ts: ts("ts").notNull(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    outcome: text("outcome").$type<"success" | "denied" | "failed">().notNull(),
    details: json<unknown>("details"),
  },
  (t) => [index("audit_ts_idx").on(t.ts)],
);

export const apiTokens = sqliteTable(
  "api_tokens",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** sha-256 hex — the token is shown once and never stored */
    tokenHash: text("token_hash").notNull(),
    scope: text("scope").$type<"read" | "control">().notNull(),
    createdAt: ts("created_at").notNull(),
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
  },
  (t) => [
    uniqueIndex("api_tokens_name_uq").on(t.name),
    uniqueIndex("api_tokens_hash_uq").on(t.tokenHash),
  ],
);

/** Small key/value store: MCP enabled flag, per-project model-usage consent (FR-008), etc. */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: json<unknown>("value").notNull(),
  updatedAt: ts("updated_at")
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});
