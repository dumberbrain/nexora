import { type Message } from "@nexora/contracts";

export type {
  Message,
  MessageList,
  NexoraEvent,
  Participant,
  SendMessageInput,
} from "@nexora/contracts";

export type MessageType = Message["type"];

/** GET /messages filters — plain primitives only (they become part of the query key). */
export type MessageFilters = {
  executionId?: string;
  taskId?: string;
  type?: MessageType;
};
