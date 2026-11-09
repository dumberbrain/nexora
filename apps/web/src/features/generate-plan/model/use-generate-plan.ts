import { useMutation, useQueryClient } from "@tanstack/react-query";

import { executionApi, executionKeys, type GeneratePlanInput } from "@/entities/execution";
import { projectKeys } from "@/entities/project";
import { taskKeys } from "@/entities/task";
import { ApiError } from "@/shared/api";

/**
 * POST /executions/:id/plan → seed the task list, refresh the execution (→ plan_ready). When the
 * user ticked "always allow", the project's remembered consent changed too (FR-008).
 */
export function useGeneratePlan(executionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GeneratePlanInput) => executionApi.generatePlan(executionId, input),
    onSuccess: (tasks, input) => {
      qc.setQueryData(taskKeys.byExecution(executionId), tasks);
      return Promise.all([
        qc.invalidateQueries({ queryKey: executionKeys.detail(executionId) }),
        input.rememberConsentForProject
          ? qc.invalidateQueries({ queryKey: projectKeys.details() })
          : undefined,
      ]);
    },
  });
}

/** FR-008: the server answers 428 APPROVAL_REQUIRED when model usage was not consented to. */
export function isConsentRequired(error: unknown): boolean {
  return error instanceof ApiError && error.code === "APPROVAL_REQUIRED";
}
