/**
 * Cache policy — Agent Teams (US6)
 * owner:        US6 web
 * keys:         teamKeys.* (["teams", ...]); bySession(id) = the TeamView of one Nexora-started
 *               Agent Teams lead session (GET /sessions/:id/team)
 * staleTime:    0 + refetchInterval 5 s while mounted — the server polls ~/.claude/teams files
 *               (best effort, inboxes are emptied within seconds) and nothing is pushed
 * gcTime:       5 min
 * invalidation: POST /runtime/agent-teams/enable invalidates executions modes(id) + runtime
 *               environment (entities/execution keys) from the choose-mode feature
 * realtime:     none (polled)
 */
export const teamKeys = {
  all: ["teams"] as const,
  bySession: (sessionId: string) => [...teamKeys.all, "session", sessionId] as const,
};

export const TEAM_CACHE = { staleTime: 0, gcTime: 5 * 60_000, refetchInterval: 5_000 } as const;
