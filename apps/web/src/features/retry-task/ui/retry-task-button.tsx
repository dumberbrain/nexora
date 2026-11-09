import { RotateCwIcon } from "lucide-react";
import { toast } from "sonner";

import { type Task, taskApi, useTaskMutation } from "@/entities/task";
import { GuardedButton } from "@/shared/ui/control/guarded-button";

import { retryBlockedReason } from "../lib/retry-rule";

/** POST …/tasks/:id/retry — a new attempt linked to the previous one (`previousAttemptId`). */
export function RetryTaskButton({ task }: { task: Pick<Task, "id" | "executionId" | "status"> }) {
  const retry = useTaskMutation({ executionId: task.executionId, taskId: task.id }, (ref) =>
    taskApi.retry(ref),
  );
  return (
    <GuardedButton
      size="xs"
      variant="outline"
      className="rounded-sm font-mono"
      aria-label={`Retry ${task.id}`}
      disabledReason={retryBlockedReason(task)}
      disabled={retry.isPending}
      onClick={() =>
        retry.mutate(undefined, {
          onError: (e) => toast.error(`Retry of ${task.id} failed`, { description: e.message }),
        })
      }
    >
      <RotateCwIcon aria-hidden="true" />
      Retry
    </GuardedButton>
  );
}
