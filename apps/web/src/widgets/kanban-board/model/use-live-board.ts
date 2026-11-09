import { useQueryClient } from "@tanstack/react-query";

import { type TaskBoardFilters, taskKeys } from "@/entities/task";
import { useLiveSubscription } from "@/shared/socket/use-live-subscription";

/**
 * Keep board(filters) live: any `task.*` event in scope (the execution room when filtered by
 * execution, else global) invalidates exactly that key. Skipped while a move is in flight —
 * a refetch then would undo the optimistic card; the move's onSettled refetches anyway.
 */
export function useLiveBoard(filters: TaskBoardFilters): void {
  const qc = useQueryClient();
  const refresh = () => {
    if (qc.isMutating({ mutationKey: taskKeys.move() }) > 0) return;
    void qc.invalidateQueries({ queryKey: taskKeys.board(filters) });
  };
  useLiveSubscription({
    ...(filters.executionId
      ? { scope: "execution" as const, id: filters.executionId }
      : { scope: "global" as const }),
    onEvents: (events) => {
      if (events.some((e) => e.type.startsWith("task."))) refresh();
    },
    onGap: refresh,
  });
}
