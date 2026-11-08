import { z } from "zod";

import { EpochMsSchema, UlidSchema } from "../primitives";
import { MAX_EVENT_SUMMARY } from "./event";

export const ParticipantSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user") }),
  z.object({ kind: z.literal("coordinator") }),
  z.object({ kind: z.literal("agent"), agentId: z.string().min(1) }),
]);
export type Participant = z.infer<typeof ParticipantSchema>;

export const MESSAGE_TYPES = [
  "instruction",
  "status",
  "question",
  "answer",
  "review_request",
  "result",
] as const;

/** User-visible communication only — never private model reasoning (FR-027). */
export const MessageSchema = z.object({
  id: UlidSchema,
  executionId: UlidSchema.nullable(),
  taskId: z.string().nullable(),
  from: ParticipantSchema,
  to: ParticipantSchema,
  type: z.enum(MESSAGE_TYPES),
  /** redacted */
  summary: z.string().max(MAX_EVENT_SUMMARY),
  ts: EpochMsSchema,
});
export type Message = z.infer<typeof MessageSchema>;

export const SendMessageInputSchema = z.object({
  text: z.string().trim().min(1).max(8000),
});
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;
