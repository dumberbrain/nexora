import { type Message, type SendMessageInput } from "@nexora/contracts";

import { http } from "@/shared/api";

import { type AgentDetail, type AgentList, type AgentListFilters } from "../model/types";

type Opts = { signal?: AbortSignal };

function toParams(f: AgentListFilters): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (f.sessionId) params.sessionId = f.sessionId;
  if (f.status?.length) params.status = f.status.join(",");
  if (f.limit) params.limit = f.limit;
  return params;
}

export const agentApi = {
  list: (filters: AgentListFilters = {}, opts: Opts = {}) =>
    http.get<AgentList>("/agents", { params: toParams(filters), ...opts }).then((r) => r.data),

  byId: (id: string, opts: Opts = {}) =>
    http.get<AgentDetail>(`/agents/${encodeURIComponent(id)}`, opts).then((r) => r.data),

  /** capability-gated (422) → the recorded Message */
  sendMessage: (id: string, input: SendMessageInput) =>
    http.post<Message>(`/agents/${encodeURIComponent(id)}/messages`, input).then((r) => r.data),
};
