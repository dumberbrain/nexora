import { z } from "zod";

import { EpochMsSchema, UlidSchema } from "../primitives";

/*
 * US6 — Agent Teams + Hybrid (research.md R3 and "S2 result"). Team state is read from
 * `~/.claude/teams/<team>/` and `~/.claude/tasks/<team>/` (read-only, `best_effort`) and from
 * hooks; Ubuliera never writes team files and never simulates a team with subagents.
 */

/** Exact phrase for enabling Agent Teams in a project (FR-011: explicit confirmation). */
export const AGENT_TEAMS_ENABLE_CONFIRMATION = "enable agent teams";

/** POST /runtime/agent-teams/enable — writes env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS="1" to the
 * project's `.claude/settings.local.json`, audited. */
export const EnableAgentTeamsInputSchema = z.object({
  projectId: UlidSchema,
  confirmation: z.literal(AGENT_TEAMS_ENABLE_CONFIRMATION),
});
export type EnableAgentTeamsInput = z.infer<typeof EnableAgentTeamsInputSchema>;

export const EnableAgentTeamsResultSchema = z.object({
  projectId: UlidSchema,
  /** absolute path of the settings file that was written */
  settingsPath: z.string(),
  /** false when the flag was already set (nothing written) */
  changed: z.boolean(),
});
export type EnableAgentTeamsResult = z.infer<typeof EnableAgentTeamsResultSchema>;

export const TeamMemberSchema = z.object({
  /** Claude agentId, e.g. `team-lead@session-9da5d295` or `teammate-one@…` */
  agentId: z.string().min(1),
  name: z.string().min(1),
  /** `team-lead` for the lead, otherwise the teammate's agent type */
  agentType: z.string().min(1),
  isLead: z.boolean(),
  status: z.enum(["active", "idle", "left"]),
  joinedAt: EpochMsSchema.nullable(),
  cwd: z.string().nullable(),
});
export type TeamMember = z.infer<typeof TeamMemberSchema>;

export const TeamTaskSchema = z.object({
  /** id from `~/.claude/tasks/<team>/` or the TaskCreated hook */
  id: z.string().min(1),
  subject: z.string().max(2000),
  status: z.string().max(64),
  owner: z.string().nullable(),
});
export type TeamTask = z.infer<typeof TeamTaskSchema>;

/** One inbox message (user-visible text only; structured protocol messages summarised). */
export const TeamMessageSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  /** plain text, or the type of a structured message (idle_notification, shutdown_request, …) */
  kind: z.string().max(64),
  summary: z.string().max(2000),
  ts: EpochMsSchema,
});
export type TeamMessage = z.infer<typeof TeamMessageSchema>;

/** GET /sessions/:id/team — the team led by a Ubuliera-started Agent Teams lead session. */
export const TeamViewSchema = z.object({
  sessionId: z.string().min(1),
  teamName: z.string().min(1),
  members: z.array(TeamMemberSchema),
  tasks: z.array(TeamTaskSchema),
  /** messages seen while polling inboxes (inboxes are emptied quickly ⇒ best effort) */
  messages: z.array(TeamMessageSchema),
  reliability: z.literal("best_effort"),
  updatedAt: EpochMsSchema,
});
export type TeamView = z.infer<typeof TeamViewSchema>;

/* ---------- /terminal Socket.IO namespace (T139) ---------- */

export const TERMINAL_NAMESPACE = "/terminal";

/** client → server `terminal:attach` (only Ubuliera-spawned lead sessions; auth required). */
export const TerminalAttachSchema = z.object({
  sessionId: z.string().min(1),
  cols: z.number().int().min(20).max(500),
  rows: z.number().int().min(5).max(200),
});
export type TerminalAttach = z.infer<typeof TerminalAttachSchema>;

export const TerminalAttachAckSchema = z.object({
  ok: z.boolean(),
  /** recent output so a late viewer sees the current screen */
  backlog: z.string().optional(),
  error: z.string().optional(),
});
export type TerminalAttachAck = z.infer<typeof TerminalAttachAckSchema>;

/** client → server `terminal:input` (keystrokes; audited as one entry per attach, not per key) */
export const TerminalInputSchema = z.object({
  sessionId: z.string().min(1),
  data: z.string().max(16_384),
});
export type TerminalInput = z.infer<typeof TerminalInputSchema>;

/** client → server `terminal:resize` */
export const TerminalResizeSchema = TerminalAttachSchema;
export type TerminalResize = z.infer<typeof TerminalResizeSchema>;

/** server → client `terminal:output` */
export const TerminalOutputSchema = z.object({ sessionId: z.string().min(1), data: z.string() });
export type TerminalOutput = z.infer<typeof TerminalOutputSchema>;

/** server → client `terminal:exit` */
export const TerminalExitSchema = z.object({
  sessionId: z.string().min(1),
  exitCode: z.number().int().nullable(),
});
export type TerminalExit = z.infer<typeof TerminalExitSchema>;
