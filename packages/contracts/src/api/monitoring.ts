import { z } from "zod";

import { AgentSchema } from "../entities/agent";
import { EventQuerySchema } from "../entities/event";
import { ProjectSchema } from "../entities/project";
import { SessionSchema } from "../entities/session";
import { AgentStatusSchema, SessionStatusSchema } from "../enums";
import { UlidSchema } from "../primitives";

/** Header carrying the per-project hook ingest secret (S1: custom headers are supported). */
export const HOOK_TOKEN_HEADER = "X-Nexora-Hook-Token";

const csv = <T extends z.ZodType>(item: T) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.split(",").filter(Boolean) : v),
    z.array(item).optional(),
  );

// ---------- projects & hooks (US1) ----------

export const ProjectListSchema = z.object({ items: z.array(ProjectSchema) });
export type ProjectList = z.infer<typeof ProjectListSchema>;

/** GET /projects/:id/hooks/preview — the exact settings change, shown before any write. */
export const HookPreviewSchema = z.object({
  settingsPath: z.string(),
  exists: z.boolean(),
  /** current file content (null when the file does not exist) */
  before: z.string().nullable(),
  /** content after install — existing hooks are kept, never removed */
  after: z.string(),
  events: z.array(z.string()),
  alreadyInstalled: z.boolean(),
});
export type HookPreview = z.infer<typeof HookPreviewSchema>;

/** POST /projects/:id/hooks/install — explicit confirmation is mandatory (FR-041). */
export const InstallHooksInputSchema = z.object({ confirm: z.literal(true) });
export type InstallHooksInput = z.infer<typeof InstallHooksInputSchema>;

// ---------- sessions & agents (US1) ----------

export const SessionListQuerySchema = z.object({
  status: csv(SessionStatusSchema),
  executionId: UlidSchema.optional(),
  projectId: UlidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type SessionListQuery = z.infer<typeof SessionListQuerySchema>;

/** Newest activity first. */
export const SessionListSchema = z.object({ items: z.array(SessionSchema) });
export type SessionList = z.infer<typeof SessionListSchema>;

export const SessionDetailSchema = z.object({
  session: SessionSchema,
  agents: z.array(AgentSchema),
});
export type SessionDetail = z.infer<typeof SessionDetailSchema>;

export const AgentListQuerySchema = z.object({
  sessionId: z.string().min(1).optional(),
  executionId: UlidSchema.optional(),
  status: csv(AgentStatusSchema),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type AgentListQuery = z.infer<typeof AgentListQuerySchema>;

export const AgentListSchema = z.object({ items: z.array(AgentSchema) });
export type AgentList = z.infer<typeof AgentListSchema>;

export const AgentDetailSchema = z.object({
  agent: AgentSchema,
  session: SessionSchema.nullable(),
  children: z.array(AgentSchema),
  /** from file.modified events attributed to this agent (derived) */
  filesChanged: z.array(z.string()),
});
export type AgentDetail = z.infer<typeof AgentDetailSchema>;

// ---------- events export (US1) ----------

/** GET /events/export — same filters as GET /events, streamed, redacted, capped at 100 000 rows. */
export const EventExportQuerySchema = EventQuerySchema.omit({ cursor: true, limit: true }).extend({
  format: z.enum(["jsonl", "csv"]).default("jsonl"),
});
export type EventExportQuery = z.infer<typeof EventExportQuerySchema>;
export const MAX_EXPORT_ROWS = 100_000;
