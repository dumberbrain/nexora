import { type Task } from "@/entities/task";
import { CancelTaskButton } from "@/features/cancel-task";
import { RequestReviewButton } from "@/features/request-review";
import { RetryTaskButton } from "@/features/retry-task";

/** Per-task controls (US3); unavailable ones stay visible with their reason. */
export function TaskActions({ task }: { task: Task }) {
  return (
    <div className="flex flex-wrap gap-1">
      <CancelTaskButton task={task} />
      <RetryTaskButton task={task} />
      <RequestReviewButton task={task} />
    </div>
  );
}
