import { type SessionStatus } from "@ubuliera/contracts";

export type {
  Message,
  RuntimeCapabilityProfile,
  SendMessageInput,
  Session,
  SessionDetail,
  SessionList,
  SessionStatus,
  Usage,
} from "@ubuliera/contracts";

/** GET /sessions filters — plain primitives only (they become part of the query key). */
export type SessionListFilters = {
  status?: SessionStatus[];
  projectId?: string;
  executionId?: string;
  limit?: number;
};

/** POST /sessions/:id/{stop,interrupt,resume,restart} — capability-gated (422). */
export type SessionControlAction = "stop" | "interrupt" | "resume" | "restart";
