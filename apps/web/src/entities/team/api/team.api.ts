import { http } from "@/shared/api";

import {
  type EnableAgentTeamsInput,
  type EnableAgentTeamsResult,
  type TeamView,
} from "../model/types";

type Opts = { signal?: AbortSignal };

export const teamApi = {
  /** TeamView of a Nexora-started Agent Teams lead session — 404 while there is no team */
  bySession: (sessionId: string, opts: Opts = {}) =>
    http.get<TeamView>(`/sessions/${encodeURIComponent(sessionId)}/team`, opts).then((r) => r.data),

  /** writes CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 to the project's .claude/settings.local.json */
  enable: (input: EnableAgentTeamsInput) =>
    http.post<EnableAgentTeamsResult>("/runtime/agent-teams/enable", input).then((r) => r.data),
};
