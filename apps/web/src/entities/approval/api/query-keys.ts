import { ENTITY_ROOTS } from "@/shared/api";

import { type ApprovalListFilters } from "../model/types";

/**
 * Cache policy — approvals (FR-033: nothing auto-approves, so the inbox must stay current)
 * owner:        US2 web (minimal per-execution inbox; the full inbox is US3)
 * keys:         approvalKeys.* (["approvals", ...]) — all/lists()/detail(id) follow the
 *               shared/api/entity-keys convention so app/socket-bridge patches them
 * staleTime:    5 s   gcTime: 5 min
 * invalidation: decision → lists()
 * realtime:     socket `entity.changed` kind=approval → patch detail(id) + invalidate lists()
 */
export const approvalKeys = {
  all: [ENTITY_ROOTS.approval] as const,
  lists: () => [...approvalKeys.all, "list"] as const,
  list: (filters: ApprovalListFilters) => [...approvalKeys.lists(), filters] as const,
  details: () => [...approvalKeys.all, "detail"] as const,
  detail: (id: string) => [...approvalKeys.details(), id] as const,
};

export const APPROVAL_CACHE = { staleTime: 5_000, gcTime: 5 * 60_000 } as const;
