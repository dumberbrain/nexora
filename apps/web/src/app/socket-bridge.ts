import { type EntityChanged, type Stats } from "@nexora/contracts";
import { type QueryClient } from "@tanstack/react-query";

import { entityDetailKey, entityListKey, statsKey } from "@/shared/api";
import { type LiveSocket } from "@/shared/socket/client";

/**
 * Apply realtime pushes to the TanStack Query cache with narrow keys (team standard):
 * entity.changed → patch the detail entry if cached + invalidate that entity's lists;
 * stats → replace the overview counters.
 */
export function startSocketBridge(qc: QueryClient, socket: LiveSocket): () => void {
  const onEntity = (change: EntityChanged) => {
    qc.setQueryData(entityDetailKey(change.kind, change.id), (old: unknown) =>
      old !== null && typeof old === "object" ? { ...old, ...change.patch } : old,
    );
    void qc.invalidateQueries({ queryKey: entityListKey(change.kind) });
  };
  const onStats = (stats: Stats) => {
    qc.setQueryData(statsKey, stats);
  };
  socket.on("entity.changed", onEntity);
  socket.on("stats", onStats);
  return () => {
    socket.off("entity.changed", onEntity);
    socket.off("stats", onStats);
  };
}
