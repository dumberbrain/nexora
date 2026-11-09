import { BanIcon } from "lucide-react";

import { type Task, taskApi, useTaskMutation } from "@/entities/task";
import { GuardedButton } from "@/shared/ui/control/guarded-button";
import { NoteDialog } from "@/shared/ui/control/note-dialog";

import { CANCEL_REASON_MAX, cancelBlockedReason } from "../lib/cancel-rule";

/** POST …/tasks/:id/cancel `{ reason? }` — confirmed first (the reason goes to the audit log). */
export function CancelTaskButton({ task }: { task: Pick<Task, "id" | "executionId" | "status"> }) {
  const cancel = useTaskMutation(
    { executionId: task.executionId, taskId: task.id },
    (ref, reason: string | undefined) => taskApi.cancel(ref, reason ? { reason } : {}),
  );
  return (
    <NoteDialog
      trigger={
        <GuardedButton
          size="xs"
          variant="outline"
          className="rounded-sm font-mono"
          aria-label={`Cancel ${task.id}`}
          disabledReason={cancelBlockedReason(task)}
        >
          <BanIcon aria-hidden="true" />
          Cancel
        </GuardedButton>
      }
      title={`Cancel task ${task.id}?`}
      description="Its session is stopped and the task moves to Cancelled. You can retry it later."
      noteLabel="Reason"
      noteMax={CANCEL_REASON_MAX}
      confirmLabel="Cancel task"
      destructive
      onConfirm={(reason) => cancel.mutateAsync(reason)}
    />
  );
}
