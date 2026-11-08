import { type SessionStatus } from "@nexora/contracts";

export type { Session, SessionDetail, SessionList, SessionStatus, Usage } from "@nexora/contracts";

/** GET /sessions filters — plain primitives only (they become part of the query key). */
export type SessionListFilters = {
  status?: SessionStatus[];
  projectId?: string;
  limit?: number;
};
