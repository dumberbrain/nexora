import { useMutation, useQueryClient } from "@tanstack/react-query";

import { executionApi, executionKeys, type SetModeInput } from "@/entities/execution";

/** PUT /executions/:id/mode → store the returned execution (→ configuring), refresh lists. */
export function useChooseMode(executionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetModeInput) => executionApi.setMode(executionId, input),
    onSuccess: (execution) => {
      qc.setQueryData(executionKeys.detail(executionId), execution);
      return Promise.all([
        qc.invalidateQueries({ queryKey: executionKeys.lists() }),
        qc.invalidateQueries({ queryKey: executionKeys.questions(executionId) }),
      ]);
    },
  });
}
