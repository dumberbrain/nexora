import { type Task } from "@/entities/task";
import { humanize } from "@/shared/lib/humanize";

const RETRYABLE: ReadonlySet<Task["status"]> = new Set(["failed", "cancelled"]);

/** Why a task cannot be retried right now, or null. */
export function retryBlockedReason(task: Pick<Task, "status">): string | null {
  return RETRYABLE.has(task.status)
    ? null
    : `The task is ${humanize(task.status)} — only failed or cancelled tasks can be retried`;
}
