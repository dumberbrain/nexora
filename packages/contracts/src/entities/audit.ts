import { z } from "zod";

import { EpochMsSchema, UlidSchema } from "../primitives";

/** `user`, `system`, or `mcp_client:<token name>`. */
export const AuditActorSchema = z
  .string()
  .regex(/^(user|system|mcp_client:[\w.-]{1,64})$/, "invalid audit actor");

/** Append-only record (FR-054) — no update/delete API exists. */
export const AuditEntrySchema = z.object({
  id: UlidSchema,
  ts: EpochMsSchema,
  actor: AuditActorSchema,
  action: z.string().min(1).max(120),
  targetType: z.string().min(1).max(60),
  targetId: z.string().max(256).nullable(),
  outcome: z.enum(["success", "denied", "failed"]),
  /** redacted */
  details: z.unknown(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
