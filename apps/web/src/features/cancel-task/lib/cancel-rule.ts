import { type Task } from "@/entities/task";
import { humanize } from "@/shared/lib/humanize";

/** TaskControlInputSchema.reason: trimmed, ≤ 1000 chars (contracts/api/controls.ts). */
export const CANCEL_REASON_MAX = 1000;

const FINISHED: ReadonlySet<Task["status"]> = new Set(["completed", "failed", "cancelled"]);

/** Why a task cannot be cancelled right now, or null. */
export function cancelBlockedReason(task: Pick<Task, "status">): string | null {
  return FINISHED.has(task.status)
    ? `The task is already ${humanize(task.status)} — nothing to cancel`
    : null;
}
