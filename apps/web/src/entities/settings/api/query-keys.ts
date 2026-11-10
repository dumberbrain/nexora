/**
 * Cache policy — settings (US8: MCP server switch, remote-access status)
 * owner:        US8 web
 * keys:         settingsKeys.* (["settings", ...]); current() = GET /settings
 * staleTime:    1 min (changes only through this page or a restart with new env vars)
 * gcTime:       10 min
 * invalidation: PUT /settings/mcp answers the full Settings — written into current() with
 *               setQueryData, no refetch
 * realtime:     none
 */
export const settingsKeys = {
  all: ["settings"] as const,
  current: () => [...settingsKeys.all, "current"] as const,
  /** mutation key of the MCP enable/disable switch */
  updateMcp: () => [...settingsKeys.all, "update-mcp"] as const,
};

export const SETTINGS_CACHE = { staleTime: 60_000, gcTime: 10 * 60_000 } as const;
