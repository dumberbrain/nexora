import { useMutation, useQueryClient } from "@tanstack/react-query";

import { approvalKeys } from "@/entities/approval";
import { executionApi, executionKeys, type ApproveExecutionInput } from "@/entities/execution";
import { taskKeys } from "@/entities/task";

/** POST /executions/:id/approve — the only call that starts an execution (→ running). */
export function useApprovePlan(executionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ApproveExecutionInput) => executionApi.approve(executionId, input),
    onSuccess: (execution) => {
      qc.setQueryData(executionKeys.detail(executionId), execution);
      return Promise.all([
        qc.invalidateQueries({ queryKey: executionKeys.lists() }),
        qc.invalidateQueries({ queryKey: taskKeys.byExecution(executionId) }),
        // unapproved risky tasks now wait in the approvals inbox
        qc.invalidateQueries({ queryKey: approvalKeys.lists() }),
      ]);
    },
  });
}
