import { z } from "zod";

import {
  EventSourceSchema,
  EventTypeSchema,
  ExecutionModeSchema,
  ReliabilitySchema,
  SeveritySchema,
} from "../enums";
import { EpochMsSchema, UlidSchema } from "../primitives";

/** Event.summary: "≤ 500 chars". */
export const MAX_EVENT_SUMMARY = 500;
/** Event.payload: "size-capped 32 KB (truncated flag)". */
export const MAX_EVENT_PAYLOAD_BYTES = 32 * 1024;

export const EventSchema = z.object({
  /** monotonic ULID — doubles as the replay cursor */
  id: UlidSchema,
  ts: EpochMsSchema,
  type: EventTypeSchema,
  source: EventSourceSchema,
  reliability: ReliabilitySchema,
  severity: SeveritySchema,
  executionId: UlidSchema.nullable(),
  sessionId: z.string().nullable(),
  agentId: z.string().nullable(),
  taskId: z.string().nullable(),
  summary: z.string().max(MAX_EVENT_SUMMARY),
  /** redacted JSON; replaced by a preview when larger than MAX_EVENT_PAYLOAD_BYTES */
  payload: z.unknown(),
  truncated: z.boolean(),
});
export type NexoraEvent = z.infer<typeof EventSchema>;

const csv = <T extends z.ZodType>(item: T) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.split(",").filter(Boolean) : v),
    z.array(item).optional(),
  );

/** GET /events filters (contracts/rest-api.md → Events & logs). */
export const EventQuerySchema = z.object({
  executionId: UlidSchema.optional(),
  sessionId: z.string().optional(),
  agentId: z.string().optional(),
  type: csv(EventTypeSchema),
  severity: csv(SeveritySchema),
  mode: ExecutionModeSchema.optional(),
  from: z.coerce.number().int().nonnegative().optional(),
  to: z.coerce.number().int().nonnegative().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  cursor: UlidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type EventQuery = z.infer<typeof EventQuerySchema>;
