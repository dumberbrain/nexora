import {
  MAX_EVENT_SUMMARY,
  type Message,
  type MessageList,
  type MessageListQuery,
  type Participant,
  type RuntimeCapabilityProfile,
} from "@ubuliera/contracts";

import { type MessageRepository } from "./message.repository";
import { AppError } from "../../http/errors";
import { redactString } from "../../lib/redactor";
import { newId } from "../../lib/ulid";
import { type DomainEmitter } from "../event-manager/domain-emitter";
import {
  CapabilityUnsupportedError,
  type ManagedRuntime,
} from "../runtime-manager/runtime-adapter";

export interface CommunicationDeps {
  messages: MessageRepository;
  runtime: Pick<ManagedRuntime, "getHandle">;
  /** capability profile of a session (null when unknown) */
  capabilityOf: (sessionId: string) => RuntimeCapabilityProfile | null;
  emitter: DomainEmitter;
  now?: () => number;
}

export interface SendToSessionInput {
  sessionId: string;
  text: string;
  from: Participant;
  type: Message["type"];
  executionId: string | null;
  taskId: string | null;
  /** recorded receiver (default: the session's main agent) */
  to?: Participant;
  /** what the runtime receives when it differs from `text` (e.g. a relay prefix) */
  deliver?: string;
}

export interface RecordInput {
  from: Participant;
  to: Participant;
  type: Message["type"];
  text: string;
  executionId: string | null;
  taskId: string | null;
  sessionId: string | null;
}

/** Redacted, whitespace-collapsed summary capped at 500 chars. */
export function messageSummary(text: string): string {
  const clean = redactString(text).replace(/\s+/g, " ").trim();
  return clean.length > MAX_EVENT_SUMMARY ? `${clean.slice(0, MAX_EVENT_SUMMARY - 1)}…` : clean;
}

const unsupported = (message: string) => new AppError("CAPABILITY_UNSUPPORTED", message);

/**
 * Communication manager (T099, FR-027). Delivers user-visible text to Ubuliera-managed sessions
 * through the runtime's `sendMessage` only, and records a Message + `message.sent` event. Only
 * the redacted summary is stored; the agent receives the full text.
 */
export class CommunicationService {
  private readonly now: () => number;

  constructor(private readonly deps: CommunicationDeps) {
    this.now = deps.now ?? Date.now;
  }

  async sendToSession(input: SendToSessionInput): Promise<Message> {
    const handle = this.deps.runtime.getHandle(input.sessionId);
    if (!handle) {
      throw unsupported(
        "Messages can only be sent to sessions Ubuliera started (this one is observe-only)",
      );
    }
    const caps = this.deps.capabilityOf(input.sessionId);
    if (caps && caps.canSendMessage === "no") {
      throw unsupported(`${caps.runtime} sessions cannot receive messages`);
    }
    try {
      await handle.sendMessage(input.deliver ?? input.text);
    } catch (err) {
      if (err instanceof CapabilityUnsupportedError) throw unsupported(err.message);
      throw err;
    }
    return this.record({
      from: input.from,
      to: input.to ?? { kind: "agent", agentId: input.sessionId },
      type: input.type,
      text: input.text,
      executionId: input.executionId,
      taskId: input.taskId,
      sessionId: input.sessionId,
    });
  }

  /** Record a message that was delivered by other means (e.g. coordinator status notes). */
  record(input: RecordInput): Message {
    const ts = this.now();
    const msg = this.deps.messages.insert({
      id: newId(ts),
      executionId: input.executionId,
      taskId: input.taskId,
      from: input.from,
      to: input.to,
      type: input.type,
      summary: messageSummary(input.text),
      ts,
    });
    this.deps.emitter.event({
      type: "message.sent",
      source: "coordinator",
      executionId: input.executionId,
      sessionId: input.sessionId,
      taskId: input.taskId,
      summary: msg.summary,
      payload: { messageId: msg.id, from: msg.from, to: msg.to, type: msg.type },
    });
    return msg;
  }

  list(q: { executionId?: string } = {}): Message[] {
    return this.deps.messages.list(q);
  }

  /** GET /messages — newest first, cursor-paged. */
  page(q: MessageListQuery): MessageList {
    return this.deps.messages.page(q);
  }
}
