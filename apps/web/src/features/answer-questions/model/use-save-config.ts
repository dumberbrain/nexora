import { useMutation, useQueryClient } from "@tanstack/react-query";

import { executionApi, executionKeys, type ExecutionConfig } from "@/entities/execution";

/** PUT /executions/:id/config → store the returned execution, refresh lists. */
export function useSaveConfig(executionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: ExecutionConfig) => executionApi.updateConfig(executionId, config),
    onSuccess: (execution) => {
      qc.setQueryData(executionKeys.detail(executionId), execution);
      return qc.invalidateQueries({ queryKey: executionKeys.lists() });
    },
  });
}
