import { MESSAGE_TYPES, ParticipantSchema } from "@nexora/contracts";
import { z } from "zod";

import {
  type Message,
  type MessageFilters,
  type MessageList,
  type NexoraEvent,
  type Participant,
} from "../model/types";

/** Who sent / received a message, as shown in the Communication Center. */
export function participantLabel(p: Participant): string {
  if (p.kind === "user") return "you";
  if (p.kind === "coordinator") return "coordinator";
  return p.agentId;
}

/** `message.sent` payload written by the communication manager (server T099). */
const MessagePayloadSchema = z.object({
  messageId: z.string().min(1),
  from: ParticipantSchema,
  to: ParticipantSchema,
  type: z.enum(MESSAGE_TYPES),
});

/**
 * Rebuild a Message from a live `message.sent` event. Only the redacted summary travels — never
 * private reasoning (FR-027). Returns null for other events and for hook-sourced prompts that
 * carry no Message payload (the caller refetches instead).
 */
export function messageFromEvent(e: NexoraEvent): Message | null {
  if (e.type !== "message.sent") return null;
  const p = MessagePayloadSchema.safeParse(e.payload);
  if (!p.success) return null;
  return {
    id: p.data.messageId,
    executionId: e.executionId,
    taskId: e.taskId,
    from: p.data.from,
    to: p.data.to,
    type: p.data.type,
    summary: e.summary,
    ts: e.ts,
  };
}

/** Put live messages (any order) at the head of a newest-first feed, skipping known ids. */
export function prependMessages(
  old: MessageList | undefined,
  messages: Message[],
): MessageList | undefined {
  if (!old) return old;
  const known = new Set(old.items.map((m) => m.id));
  const fresh = messages.filter((m) => !known.has(m.id)).sort((a, b) => b.ts - a.ts);
  if (fresh.length === 0) return old;
  return { ...old, items: [...fresh, ...old.items] };
}

export function matchesMessageFilters(m: Message, f: MessageFilters): boolean {
  if (f.executionId && m.executionId !== f.executionId) return false;
  if (f.taskId && m.taskId !== f.taskId) return false;
  if (f.type && m.type !== f.type) return false;
  return true;
}
