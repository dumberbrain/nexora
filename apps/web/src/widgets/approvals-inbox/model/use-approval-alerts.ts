import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { approvalKeys } from "@/entities/approval";
import { useLiveSubscription } from "@/shared/socket/use-live-subscription";

function approvalIdOf(payload: unknown): string | undefined {
  if (payload === null || typeof payload !== "object") return undefined;
  const id = (payload as { approvalId?: unknown }).approvalId;
  return typeof id === "string" ? id : undefined;
}

/**
 * App-wide: toast every new approval request (`permission.requested`) seen on the global room
 * and refresh the inbox. Nothing auto-approves (FR-033) — the toast only points the user at it.
 */
export function useApprovalAlerts(): void {
  const qc = useQueryClient();
  useLiveSubscription({
    scope: "global",
    onEvents: (events) => {
      const requested = events.filter((e) => e.type === "permission.requested");
      if (requested.length === 0) return;
      for (const e of requested) {
        toast.warning("Approval needed", {
          id: approvalIdOf(e.payload) ?? e.id,
          description: e.summary,
        });
      }
      void qc.invalidateQueries({ queryKey: approvalKeys.lists() });
    },
    onGap: () => void qc.invalidateQueries({ queryKey: approvalKeys.lists() }),
  });
}
