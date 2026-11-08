import { z } from "zod";

/** Helper: a zod enum plus its literal values and union type, from one tuple. */
const def = <const T extends readonly [string, ...string[]]>(values: T) => ({
  values,
  schema: z.enum(values),
});

export const EXECUTION_MODES = def([
  "multi_session",
  "agent_teams",
  "subagents",
  "workflow",
  "hybrid",
] as const);
export const ExecutionModeSchema = EXECUTION_MODES.schema;
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;

export const STRATEGIES = def([
  "spec_driven",
  "plan_first",
  "tdd",
  "direct",
  "research_first",
] as const);
export const StrategySchema = STRATEGIES.schema;
export type Strategy = z.infer<typeof StrategySchema>;

export const EXECUTION_STATUSES = def([
  "draft",
  "analyzing",
  "awaiting_mode",
  "configuring",
  "plan_ready",
  "awaiting_approval",
  "running",
  "paused",
  "verifying",
  "completed",
  "failed",
  "cancelled",
] as const);
export const ExecutionStatusSchema = EXECUTION_STATUSES.schema;
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export const TASK_STATUSES = def([
  "pending",
  "queued",
  "planning",
  "running",
  "waiting_for_input",
  "blocked",
  "reviewing",
  "completed",
  "failed",
  "cancelled",
] as const);
export const TaskStatusSchema = TASK_STATUSES.schema;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const SESSION_STATUSES = def([
  "starting",
  "running",
  "idle",
  "waiting_for_approval",
  "paused",
  "unresponsive",
  "stopped",
  "failed",
  "unknown",
] as const);
export const SessionStatusSchema = SESSION_STATUSES.schema;
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const AGENT_KINDS = def([
  "main",
  "subagent",
  "team_lead",
  "teammate",
  "workflow_node",
] as const);
export const AgentKindSchema = AGENT_KINDS.schema;
export type AgentKind = z.infer<typeof AgentKindSchema>;

export const AGENT_STATUSES = def([
  "spawning",
  "running",
  "idle",
  "waiting",
  "completed",
  "failed",
  "stopped",
] as const);
export const AgentStatusSchema = AGENT_STATUSES.schema;
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

/** The 20 normalised event types (data-model.md → Event). */
export const EVENT_TYPES = def([
  "session.started",
  "session.stopped",
  "agent.spawned",
  "agent.completed",
  "task.created",
  "task.assigned",
  "task.started",
  "task.completed",
  "task.failed",
  "tool.invoked",
  "tool.completed",
  "file.modified",
  "permission.requested",
  "permission.decided",
  "agent.waiting",
  "message.sent",
  "workflow.started",
  "workflow.node_changed",
  "workflow.completed",
  "error",
] as const);
export const EventTypeSchema = EVENT_TYPES.schema;
export type EventType = z.infer<typeof EventTypeSchema>;

export const EVENT_SOURCES = def([
  "hook",
  "stream_json",
  "agent_sdk",
  "team_files",
  "coordinator",
  "orchestrator",
  "git",
] as const);
export const EventSourceSchema = EVENT_SOURCES.schema;
export type EventSource = z.infer<typeof EventSourceSchema>;

/** authoritative = runtime-reported · derived = inferred · best_effort = polled files. */
export const RELIABILITIES = def(["authoritative", "derived", "best_effort"] as const);
export const ReliabilitySchema = RELIABILITIES.schema;
export type Reliability = z.infer<typeof ReliabilitySchema>;

export const SEVERITIES = def(["debug", "info", "warn", "error"] as const);
export const SeveritySchema = SEVERITIES.schema;
export type Severity = z.infer<typeof SeveritySchema>;

/** Anything but `normal` requires explicit human approval (FR-033). */
export const RISK_CLASSES = def([
  "normal",
  "destructive",
  "expensive",
  "deploy",
  "architecture",
] as const);
export const RiskClassSchema = RISK_CLASSES.schema;
export type RiskClass = z.infer<typeof RiskClassSchema>;

export const APPROVAL_STATUSES = def([
  "pending",
  "approved",
  "rejected",
  "expired_session",
] as const);
export const ApprovalStatusSchema = APPROVAL_STATUSES.schema;
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const RUNTIME_KINDS = def([
  "agent_sdk",
  "cli_headless",
  "agent_team_pty",
  "external_observed",
] as const);
export const RuntimeKindSchema = RUNTIME_KINDS.schema;
export type RuntimeKind = z.infer<typeof RuntimeKindSchema>;

export const PRIORITIES = def(["p1", "p2", "p3"] as const);
export const PrioritySchema = PRIORITIES.schema;
export type Priority = z.infer<typeof PrioritySchema>;
