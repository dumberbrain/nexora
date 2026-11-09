import { SearchCheckIcon } from "lucide-react";

import { type Task, taskApi, useTaskMutation } from "@/entities/task";
import { GuardedButton } from "@/shared/ui/control/guarded-button";
import { NoteDialog } from "@/shared/ui/control/note-dialog";

import { reviewBlockedReason, REVIEW_NOTE_MAX } from "../lib/review-rule";

/** POST …/tasks/:id/review `{ note? }` — review by the Code Reviewer role. */
export function RequestReviewButton({
  task,
}: {
  task: Pick<Task, "id" | "executionId" | "status">;
}) {
  const review = useTaskMutation(
    { executionId: task.executionId, taskId: task.id },
    (ref, note: string | undefined) => taskApi.requestReview(ref, note ? { note } : {}),
  );
  return (
    <NoteDialog
      trigger={
        <GuardedButton
          size="xs"
          variant="outline"
          className="rounded-sm font-mono"
          aria-label={`Request review of ${task.id}`}
          disabledReason={reviewBlockedReason(task)}
        >
          <SearchCheckIcon aria-hidden="true" />
          Review
        </GuardedButton>
      }
      title={`Request a review of ${task.id}`}
      description="The Code Reviewer agent reviews this task's changes and reports back in the Communication Center."
      noteLabel="Note for the reviewer"
      noteMax={REVIEW_NOTE_MAX}
      confirmLabel="Request review"
      onConfirm={(note) => review.mutateAsync(note)}
    />
  );
}
