/**
 * Cache policy — API tokens (US8, MCP / automation clients)
 * owner:        US8 web
 * keys:         apiTokenKeys.* (["api-tokens", ...]); list() = GET /tokens
 * staleTime:    30 s (lastUsedAt moves while MCP clients call in)
 * gcTime:       10 min
 * invalidation: create prepends `result.token` (never the secret) into list() and invalidates it;
 *               revoke writes the returned token in place and invalidates list()
 * secrets:      the one-time secret is NEVER written to the query cache; the create mutation
 *               uses gcTime 0 and is reset when the one-time dialog closes
 * realtime:     none
 */
export const apiTokenKeys = {
  all: ["api-tokens"] as const,
  lists: () => [...apiTokenKeys.all, "list"] as const,
  list: () => [...apiTokenKeys.lists()] as const,
  /** mutation keys */
  create: () => [...apiTokenKeys.all, "create"] as const,
  revoke: () => [...apiTokenKeys.all, "revoke"] as const,
};

export const API_TOKEN_CACHE = { staleTime: 30_000, gcTime: 10 * 60_000 } as const;
