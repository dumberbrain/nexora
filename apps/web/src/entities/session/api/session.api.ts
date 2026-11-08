import { http } from "@/shared/api";

import { type SessionDetail, type SessionList, type SessionListFilters } from "../model/types";

type Opts = { signal?: AbortSignal };

function toParams(f: SessionListFilters): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (f.status?.length) params.status = f.status.join(",");
  if (f.projectId) params.projectId = f.projectId;
  if (f.limit) params.limit = f.limit;
  return params;
}

export const sessionApi = {
  /** newest activity first */
  list: (filters: SessionListFilters = {}, opts: Opts = {}) =>
    http.get<SessionList>("/sessions", { params: toParams(filters), ...opts }).then((r) => r.data),

  byId: (id: string, opts: Opts = {}) =>
    http.get<SessionDetail>(`/sessions/${encodeURIComponent(id)}`, opts).then((r) => r.data),
};
