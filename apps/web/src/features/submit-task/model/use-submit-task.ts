import { useMutation, useQueryClient } from "@tanstack/react-query";

import { executionApi, executionKeys } from "@/entities/execution";

/** POST /executions → seed detail(id) with the analysed execution + refresh lists. */
export function useSubmitTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: executionApi.create,
    onSuccess: (execution) => {
      qc.setQueryData(executionKeys.detail(execution.id), execution);
      return qc.invalidateQueries({ queryKey: executionKeys.lists() });
    },
  });
}
