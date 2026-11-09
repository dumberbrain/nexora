import { http } from "@/shared/api";

import {
  type Message,
  type SendMessageInput,
  type Session,
  type SessionControlAction,
  type SessionDetail,
  type SessionList,
  type SessionListFilters,
} from "../model/types";

type Opts = { signal?: AbortSignal };

function toParams(f: SessionListFilters): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (f.status?.length) params.status = f.status.join(",");
  if (f.projectId) params.projectId = f.projectId;
  if (f.executionId) params.executionId = f.executionId;
  if (f.limit) params.limit = f.limit;
  return params;
}

const path = (id: string, sub = "") => `/sessions/${encodeURIComponent(id)}${sub}`;

export const sessionApi = {
  /** newest activity first */
  list: (filters: SessionListFilters = {}, opts: Opts = {}) =>
    http.get<SessionList>("/sessions", { params: toParams(filters), ...opts }).then((r) => r.data),

  byId: (id: string, opts: Opts = {}) =>
    http.get<SessionDetail>(path(id), opts).then((r) => r.data),

  /** 422 CAPABILITY_UNSUPPORTED / 409 observe-only; returns the updated Session */
  control: (id: string, action: SessionControlAction) =>
    http.post<Session>(path(id, `/${action}`)).then((r) => r.data),

  /** send to the session's main agent (capability-gated) → the recorded Message */
  sendMessage: (id: string, input: SendMessageInput) =>
    http.post<Message>(path(id, "/messages"), input).then((r) => r.data),
};
