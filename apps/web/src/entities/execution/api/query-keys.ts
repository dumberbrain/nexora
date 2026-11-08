import { ENTITY_ROOTS } from "@/shared/api";

/**
 * Cache policy — executions
 * owner:        US2 web (orchestration)
 * keys:         executionKeys.* (["executions", ...]) — all/lists()/detail(id) follow the
 *               shared/api/entity-keys convention so app/socket-bridge patches them
 * staleTime:    15 s   gcTime: 10 min  (status moves fast while running; the socket keeps
 *               detail(id) current and invalidates lists() on every execution change)
 * sub-keys:     modes(id) / questions(id) / verification(id) live under detail(id) so
 *               invalidating detail(id) refreshes them too; they are derived server-side
 *               from the execution's state → staleTime 0 (refetched on every mount)
 * invalidation: create → lists(); mode/config/approve/stop → setQueryData(detail(id)) + lists()
 * realtime:     socket `entity.changed` kind=execution → patch detail(id) + invalidate lists()
 */
export const executionKeys = {
  all: [ENTITY_ROOTS.execution] as const,
  lists: () => [...executionKeys.all, "list"] as const,
  details: () => [...executionKeys.all, "detail"] as const,
  detail: (id: string) => [...executionKeys.details(), id] as const,
  modes: (id: string) => [...executionKeys.detail(id), "modes"] as const,
  questions: (id: string) => [...executionKeys.detail(id), "questions"] as const,
  verification: (id: string) => [...executionKeys.detail(id), "verification"] as const,
};

/**
 * Cache policy — runtime environment (GET /runtime/environment)
 * staleTime: 1 min (Claude CLI install/auth rarely changes while the app is open)
 * gcTime: 10 min · invalidation/realtime: none
 */
export const runtimeKeys = {
  all: ["runtime"] as const,
  environment: () => [...runtimeKeys.all, "environment"] as const,
};

export const EXECUTION_CACHE = { staleTime: 15_000, gcTime: 10 * 60_000 } as const;
export const DERIVED_CACHE = { staleTime: 0, gcTime: 5 * 60_000 } as const;
export const RUNTIME_CACHE = { staleTime: 60_000, gcTime: 10 * 60_000 } as const;
