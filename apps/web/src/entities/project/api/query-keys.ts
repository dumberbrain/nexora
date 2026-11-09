/**
 * Cache policy — projects
 * owner:        US1 web (monitoring)
 * keys:         projectKeys.* (["projects", ...])
 * staleTime:    5 min   gcTime: 30 min  (registered projects change only by user action)
 * invalidation: register → lists(); hooks install/uninstall → lists() + hookPreview(id);
 *               consent PUT → setQueryData(modelConsent(id)); model-assisted plan with
 *               "remember" → invalidate modelConsent(id)
 * realtime:     none (no project socket event)
 */
export const projectKeys = {
  all: ["projects"] as const,
  lists: () => [...projectKeys.all, "list"] as const,
  details: () => [...projectKeys.all, "detail"] as const,
  detail: (id: string) => [...projectKeys.details(), id] as const,
  /** settings diff — always refetched when the install dialog opens */
  hookPreview: (id: string) => [...projectKeys.detail(id), "hook-preview"] as const,
  /** FR-008 "always allow model usage" — set by the consent dialog, revoked by the toggle */
  modelConsent: (id: string) => [...projectKeys.detail(id), "model-consent"] as const,
};

export const PROJECT_CACHE = { staleTime: 5 * 60_000, gcTime: 30 * 60_000 } as const;
