import { ApprovalDecisionInputSchema } from "@nexora/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { approvalApi, type ApprovalDecisionInput, approvalKeys } from "@/entities/approval";
import { statsKey } from "@/shared/api";

export const DECISION_NOTE_MAX = 1000;

/** Form shape: only the optional note; the decision comes from the clicked button. */
export const DecisionNoteSchema = z.object({
  note: z
    .string()
    .trim()
    .max(DECISION_NOTE_MAX, "At most 1 000 characters")
    .pipe(ApprovalDecisionInputSchema.shape.note.unwrap()),
});
export type DecisionNoteValues = z.input<typeof DecisionNoteSchema>;
export type DecisionNote = z.output<typeof DecisionNoteSchema>;

/** POST /approvals/:id/decision (explicit human decision, FR-033) → refresh the inbox. */
export function useDecideApproval(approvalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ApprovalDecisionInput) => approvalApi.decide(approvalId, input),
    onSuccess: (approval) => {
      qc.setQueryData(approvalKeys.detail(approvalId), approval);
      return Promise.all([
        qc.invalidateQueries({ queryKey: approvalKeys.lists() }),
        qc.invalidateQueries({ queryKey: statsKey }),
      ]);
    },
  });
}
