import { type Task } from "@/entities/task";
import { humanize } from "@/shared/lib/humanize";

/** RequestReviewInputSchema.note: trimmed, ≤ 2000 chars (contracts/api/controls.ts). */
export const REVIEW_NOTE_MAX = 2000;

/** Why a review cannot be requested right now, or null. */
export function reviewBlockedReason(task: Pick<Task, "status">): string | null {
  return task.status === "completed"
    ? null
    : `The task is ${humanize(task.status)} — reviews are requested for completed tasks`;
}
